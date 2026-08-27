const jwt = require('jsonwebtoken');
const Reporte = require('../models/Reporte');
const Auditoria = require('../models/Auditoria');

const locksPorReporte = new Map();
const usuariosEnReporte = new Map();

function initCollaborationSockets(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Autenticación requerida para WebSocket: falta token JWT'));
    }
    try {
      const secret = (process.env.JWT_SECRET || 'fallback_secret_key').trim();
      const decoded = jwt.verify(token, secret);
      socket.usuario = decoded;
      next();
    } catch (err) {
      next(new Error('Token JWT de usuario inválido en WebSocket'));
    }
  });

  io.on('connection', (socket) => {
    const usuario = socket.usuario;

    socket.on('unirse_reporte', async ({ reporteId }) => {
      try {
        socket.join(`reporte_${reporteId}`);
        socket.reporteActual = reporteId;

        if (!usuariosEnReporte.has(reporteId)) {
          usuariosEnReporte.set(reporteId, new Map());
        }
        usuariosEnReporte.get(reporteId).set(socket.id, {
          usuarioId: usuario.id,
          nombre: usuario.nombre || usuario.correo,
          correo: usuario.correo,
        });

        if (!locksPorReporte.has(reporteId)) {
          locksPorReporte.set(reporteId, {});
        }

        const reporte = await Reporte.findById(reporteId);
        if (!reporte || reporte.eliminado) {
          socket.emit('error_socket', { mensaje: 'Reporte no encontrado o eliminado' });
          return;
        }

        const reporteRes = reporte.toObject();
        reporteRes.novedades = (reporteRes.novedades || []).filter(n => !n.eliminado);

        socket.emit('reporte_cargado', {
          reporte: reporteRes,
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

    socket.on('unlock_campo', ({ reporteId, campoKey }) => {
      const locks = locksPorReporte.get(reporteId);
      if (locks && locks[campoKey] && locks[campoKey].usuarioId === usuario.id) {
        delete locks[campoKey];
        io.to(`reporte_${reporteId}`).emit('campo_liberado', { campoKey });
      }
    });

    socket.on('agregar_novedad', async ({ reporteId, novedad }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte || reporte.eliminado) return;

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

    socket.on('actualizar_parametros', async ({ reporteId, parametros }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte || reporte.eliminado) return;

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

        // Registrar o actualizar al usuario modificador como colaborador
        if (usuario && usuario.id) {
          const colabIndex = reporte.colaboradores.findIndex(
            c => c.usuario_id.toString() === usuario.id.toString()
          );
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
        }

        await reporte.save();

        io.to(`reporte_${reporteId}`).emit('parametros_actualizados', {
          reporteId,
          parametros,
          colaboradores: reporte.colaboradores,
          actualizadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al actualizar parámetros', error: err.message });
      }
    });

    socket.on('actualizar_novedad', async ({ reporteId, novedadId, cambios }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte || reporte.eliminado) return;

        const novedad = reporte.novedades.id(novedadId);
        if (!novedad || novedad.eliminado) return;

        const campos = [
          'tipo_evento', 'direccion', 'aga', 'instituciones', 'fecha_evento',
          'hora_evento', 'latitud', 'longitud', 'recurso_asignado', 'estado_operativo',
          'descripcion', 'acciones_inmediatas', 'fotos', 'estado_novedad', 'solucionado'
        ];

        campos.forEach((campo) => {
          if (cambios && cambios[campo] !== undefined) {
            novedad[campo] = cambios[campo];
          }
        });

        // Registrar o actualizar al usuario modificador como colaborador
        if (usuario && usuario.id) {
          const colabIndex = reporte.colaboradores.findIndex(
            c => c.usuario_id.toString() === usuario.id.toString()
          );
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
        }

        await reporte.save();

        io.to(`reporte_${reporteId}`).emit('novedad_actualizada', {
          novedad,
          colaboradores: reporte.colaboradores,
          elaborado_por: reporte.elaborado_por,
          actualizadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al actualizar novedad', error: err.message });
      }
    });

    socket.on('eliminar_novedad', async ({ reporteId, novedadId }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte || reporte.eliminado) return;

        const novedad = reporte.novedades.id(novedadId);
        if (!novedad || novedad.eliminado) return;

        // Soft delete novedad
        novedad.eliminado = true;
        novedad.eliminado_en = new Date();

        if (usuario && usuario.id) {
          const colabIndex = reporte.colaboradores.findIndex(
            c => c.usuario_id.toString() === usuario.id.toString()
          );
          if (colabIndex >= 0) {
            reporte.colaboradores[colabIndex].ultimo_aporte = new Date();
            reporte.colaboradores[colabIndex].total_ediciones += 1;
          }
        }

        await reporte.save();

        io.to(`reporte_${reporteId}`).emit('novedad_eliminada', {
          novedadId,
          colaboradores: reporte.colaboradores,
          elaborado_por: reporte.elaborado_por,
          eliminadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al eliminar novedad', error: err.message });
      }
    });

    socket.on('eliminar_reporte', async ({ reporteId }) => {
      try {
        const reporte = await Reporte.findById(reporteId);
        if (!reporte || reporte.eliminado) {
          socket.emit('error_socket', { mensaje: 'Reporte no encontrado' });
          return;
        }

        const detalles = {
          codigo: reporte.codigo,
          titulo: reporte.titulo,
          numero_rds: reporte.numero_rds,
          total_novedades: reporte.novedades?.filter(n => !n.eliminado).length || 0,
          tipo_eliminacion: 'SOFT_DELETE',
        };

        // Soft delete reporte
        reporte.eliminado = true;
        reporte.eliminado_en = new Date();
        await reporte.save();

        await Auditoria.create({
          usuario_id: usuario.id,
          usuario_correo: usuario.correo,
          reporte_id: reporteId,
          entidad: 'REPORTE',
          accion: 'ELIMINAR',
          detalles,
        });

        io.to(`reporte_${reporteId}`).emit('reporte_eliminado', {
          reporteId,
          detalles,
          eliminadoPor: usuario.nombre || usuario.correo,
        });

        // Limpiar locks y usuarios del reporte en memoria
        locksPorReporte.delete(reporteId);
        usuariosEnReporte.delete(reporteId);
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al eliminar reporte', error: err.message });
      }
    });

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
