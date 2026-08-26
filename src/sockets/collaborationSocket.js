const jwt = require('jsonwebtoken');
const Reporte = require('../models/Reporte');
const Auditoria = require('../models/Auditoria');

// Estado en memoria de bloqueos y usuarios activos por reporte
const locksPorReporte = new Map();
const usuariosEnReporte = new Map();

function initCollaborationSockets(io) {
  // Middleware de autenticación para WebSockets con SCRIPT_API_TOKEN y JWT
  io.use((socket, next) => {
    const scriptToken = socket.handshake.auth?.api_token || socket.handshake.query?.api_token || socket.handshake.headers?.['x-api-token'];
    const requiredScriptToken = (process.env.SCRIPT_API_TOKEN || '').trim();

    // Validar SCRIPT_API_TOKEN del .env
    if (requiredScriptToken) {
      if (!scriptToken || scriptToken.trim() !== requiredScriptToken) {
        return next(new Error('Acceso denegado: SCRIPT_API_TOKEN inválido para WebSocket'));
      }
    }

    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Autenticación requerida para WebSocket: falta token de usuario'));
    }
    try {
      const secret = (process.env.JWT_SECRET || 'fallback_secret_key').trim();
      const decoded = jwt.verify(token, secret);
      socket.usuario = decoded;
      next();
    } catch (err) {
      next(new Error('Token de usuario inválido en WebSocket'));
    }
  });

  io.on('connection', (socket) => {
    const usuario = socket.usuario;

    // 1. Unirse a la sala de un reporte específico
    socket.on('unirse_reporte', async ({ reporteId }) => {
      try {
        socket.join(`reporte_${reporteId}`);
        socket.reporteActual = reporteId;

        // Registrar usuario activo en memoria de la sala
        if (!usuariosEnReporte.has(reporteId)) {
          usuariosEnReporte.set(reporteId, new Map());
        }
        usuariosEnReporte.get(reporteId).set(socket.id, {
          usuarioId: usuario.id,
          nombre: usuario.nombre || usuario.correo,
          correo: usuario.correo,
        });

        // Asegurar que exista mapa de locks para este reporte
        if (!locksPorReporte.has(reporteId)) {
          locksPorReporte.set(reporteId, {});
        }

        // Obtener estado actual del reporte desde MongoDB
        const reporte = await Reporte.findById(reporteId);
        
        socket.emit('reporte_cargado', {
          reporte,
          locks: locksPorReporte.get(reporteId),
          usuariosActivos: Array.from(usuariosEnReporte.get(reporteId).values()),
        });

        io.to(`reporte_${reporteId}`).emit('usuarios_actualizados', {
          usuariosActivos: Array.from(usuariosEnReporte.get(reporteId).values()),
        });

      } catch (error) {
        socket.emit('error_socket', { mensaje: 'Error al unirse al reporte', error: error.message });
      }
    });

    // 2. Bloqueo de campo para evitar Race Conditions (Lock)
    socket.on('lock_campo', ({ reporteId, campoKey }) => {
      if (!locksPorReporte.has(reporteId)) {
        locksPorReporte.set(reporteId, {});
      }
      const locks = locksPorReporte.get(reporteId);

      if (locks[campoKey] && locks[campoKey].usuarioId !== usuario.id) {
        socket.emit('lock_denegado', {
          campoKey,
          bloqueadoPor: locks[campoKey].usuarioNombre,
        });
        return;
      }

      locks[campoKey] = {
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre || usuario.correo,
        socketId: socket.id,
        timestamp: Date.now(),
      };

      io.to(`reporte_${reporteId}`).emit('campo_bloqueado', {
        campoKey,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre || usuario.correo,
      });
    });

    // 3. Liberar bloqueo de campo (Unlock)
    socket.on('unlock_campo', ({ reporteId, campoKey }) => {
      const locks = locksPorReporte.get(reporteId);
      if (locks && locks[campoKey] && locks[campoKey].usuarioId === usuario.id) {
        delete locks[campoKey];
        io.to(`reporte_${reporteId}`).emit('campo_liberado', { campoKey });
      }
    });

    // 4. Agregar Novedad en tiempo real (1:N) con actualización atómica y autores (N:N)
    socket.on('agregar_novedad', async ({ reporteId, novedad }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte) return;

        const nuevaNovedad = {
          usuario_id: usuario.id,
          usuario_nombre: usuario.nombre || usuario.correo,
          tipo_evento: novedad.tipo_evento || 'AGUA',
          direccion: novedad.direccion || 'Sin dirección',
          aga: novedad.aga || 'A09',
          instituciones: novedad.instituciones || '@emapagye @interagua',
          fecha_evento: novedad.fecha_evento || new Date().toISOString().split('T')[0],
          hora_evento: novedad.hora_evento || '12:00',
          latitud: novedad.latitud !== undefined ? Number(novedad.latitud) : -2.1894,
          longitud: novedad.longitud !== undefined ? Number(novedad.longitud) : -79.8891,
          recurso_asignado: novedad.recurso_asignado || 'INS-ALC 🚙',
          estado_operativo: novedad.estado_operativo || '⛔PENDIENTE',
          descripcion: novedad.descripcion || '',
          acciones_inmediatas: novedad.acciones_inmediatas || '',
          fotos: Array.isArray(novedad.fotos) ? novedad.fotos : [],
        };

        reporte.novedades.push(nuevaNovedad);

        // Actualizar colaborador en N:N
        const colabIndex = reporte.colaboradores.findIndex(c => c.usuario_id.toString() === usuario.id);
        if (colabIndex >= 0) {
          reporte.colaboradores[colabIndex].ultimo_aporte = new Date();
          reporte.colaboradores[colabIndex].total_ediciones += 1;
        } else {
          reporte.colaboradores.push({
            usuario_id: usuario.id,
            nombre: usuario.nombre || usuario.correo,
            correo: usuario.correo,
            primer_aporte: new Date(),
            ultimo_aporte: new Date(),
            total_ediciones: 1,
          });
        }

        await reporte.save();

        io.to(`reporte_${reporteId}`).emit('novedad_agregada', {
          novedad: reporte.novedades[reporte.novedades.length - 1],
          colaboradores: reporte.colaboradores,
          elaborado_por: reporte.elaborado_por,
        });

      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al agregar novedad', error: err.message });
      }
    });

    // 5. Actualizar parámetros institucionales en tiempo real
    socket.on('actualizar_parametros', async ({ reporteId, parametros }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte) return;

        const campos = [
          'titulo', 'observaciones_generales', 'numero_rds', 'fecha_reporte',
          'hora_inicio', 'hora_fin', 'revisado_por', 'cabecera', 'periodo',
          'inocar_fecha', 'inocar_pleamar', 'inocar_bajamar'
        ];

        campos.forEach((campo) => {
          if (parametros[campo] !== undefined) {
            reporte[campo] = parametros[campo];
          }
        });

        await reporte.save();

        io.to(`reporte_${reporteId}`).emit('parametros_actualizados', {
          reporteId,
          parametros,
          actualizadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al actualizar parámetros', error: err.message });
      }
    });

    // 6. Desconexión y limpieza de locks
    socket.on('disconnect', () => {
      const reporteId = socket.reporteActual;
      if (reporteId) {
        if (usuariosEnReporte.has(reporteId)) {
          usuariosEnReporte.get(reporteId).delete(socket.id);
          io.to(`reporte_${reporteId}`).emit('usuarios_actualizados', {
            usuariosActivos: Array.from(usuariosEnReporte.get(reporteId).values()),
          });
        }

        const locks = locksPorReporte.get(reporteId);
        if (locks) {
          Object.keys(locks).forEach((campoKey) => {
            if (locks[campoKey].socketId === socket.id) {
              delete locks[campoKey];
              io.to(`reporte_${reporteId}`).emit('campo_liberado', { campoKey });
            }
          });
        }
      }
    });
  });
}

module.exports = initCollaborationSockets;
