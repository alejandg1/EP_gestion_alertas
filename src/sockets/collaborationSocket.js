const jwt = require('jsonwebtoken');
const { Reporte, ReporteColaborador, Novedad, NovedadFoto, Usuario, Auditoria } = require('../models');

const locksPorReporte = new Map();
const usuariosEnReporte = new Map();

// Helper para registrar/actualizar colaboración en la tabla intermedia y recalcular elaborado_por
const registrarColaboracionSocket = async (reporteId, usuarioId) => {
  if (!reporteId || !usuarioId) return { colaboradores: [], elaboradoPor: '' };

  const [colaborador, creado] = await ReporteColaborador.findOrCreate({
    where: { reporte_id: reporteId, usuario_id: usuarioId },
    defaults: {
      primer_aporte: new Date(),
      ultimo_aporte: new Date(),
      total_ediciones: 1,
    }
  });

  if (!creado) {
    colaborador.ultimo_aporte = new Date();
    colaborador.total_ediciones += 1;
    await colaborador.save();
  }

  const colaboraciones = await ReporteColaborador.findAll({
    where: { reporte_id: reporteId },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo'] }],
    order: [['primer_aporte', 'ASC']]
  });

  const listaColaboradores = colaboraciones.map(c => ({
    usuario_id: c.usuario_id,
    nombre: c.usuario?.nombre || c.usuario?.correo,
    correo: c.usuario?.correo,
    primer_aporte: c.primer_aporte,
    ultimo_aporte: c.ultimo_aporte,
    total_ediciones: c.total_ediciones,
  }));

  const nombres = listaColaboradores.map(c => c.nombre || c.correo).filter(Boolean);
  const elaboradoPor = [...new Set(nombres)].join(' – ');

  await Reporte.update({ elaborado_por: elaboradoPor }, { where: { id: reporteId } });

  return { colaboradores: listaColaboradores, elaboradoPor };
};

// Helper para serializar el reporte en un formato 100% compatible con el frontend
const serializarReporteParaSocket = async (reporteId) => {
  const reporte = await Reporte.findByPk(reporteId, {
    include: [
      {
        model: ReporteColaborador,
        as: 'reporte_colaboradores',
        include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo', 'rol'] }]
      },
      {
        model: Novedad,
        as: 'novedades',
        include: [
          { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo'] },
          { model: NovedadFoto, as: 'fotos' }
        ]
      }
    ]
  });

  if (!reporte) return null;

  const repJson = reporte.toJSON();
  const colaboradores = (repJson.reporte_colaboradores || []).map(c => ({
    usuario_id: c.usuario_id,
    nombre: c.usuario?.nombre || c.usuario?.correo,
    correo: c.usuario?.correo,
    primer_aporte: c.primer_aporte,
    ultimo_aporte: c.ultimo_aporte,
    total_ediciones: c.total_ediciones,
  }));

  const novedades = (repJson.novedades || []).map(nov => ({
    _id: nov.id,
    id: nov.id,
    reporte_id: nov.reporte_id,
    usuario_id: nov.usuario_id,
    usuario_nombre: nov.usuario?.nombre || nov.usuario?.correo,
    tipo: nov.tipo,
    tipo_evento: nov.tipo,
    direccion: nov.direccion,
    aga: nov.aga,
    instituciones: nov.instituciones,
    fecha: nov.fecha,
    fecha_evento: nov.fecha ? new Date(nov.fecha).toISOString().split('T')[0] : '',
    hora_evento: nov.fecha ? new Date(nov.fecha).toTimeString().split(' ')[0].substring(0, 5) : '',
    latitud: nov.latitud,
    longitud: nov.longitud,
    recurso: nov.recurso,
    recurso_asignado: nov.recurso,
    estado: nov.estado,
    estado_operativo: nov.estado,
    descripcion: nov.descripcion,
    acciones: nov.acciones,
    acciones_inmediatas: nov.acciones,
    fotos: (nov.fotos || []).map(f => f.url_foto),
    datos_adicionales: nov.datos_adicionales,
    created_at: nov.created_at,
    updated_at: nov.updated_at,
  }));

  return {
    _id: repJson.id,
    id: repJson.id,
    codigo: repJson.codigo,
    titulo: repJson.titulo,
    numero_rds: repJson.numero_rds,
    fecha: repJson.fecha,
    fecha_reporte: repJson.fecha,
    hora_inicio: repJson.hora_inicio || '06:00',
    hora_fin: repJson.hora_fin || '22:00',
    revisado_por: repJson.revisado_por,
    cabecera: repJson.cabecera,
    periodo: repJson.periodo,
    inocar_fecha: repJson.inocar_fecha,
    inocar_pleamar: repJson.inocar_pleamar,
    inocar_bajamar: repJson.inocar_bajamar,
    observaciones_generales: repJson.observaciones_generales,
    elaborado_por: repJson.elaborado_por,
    colaboradores,
    novedades,
  };
};

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

    // 1. UNIRSE A LA SALA DE UN REPORTE
    socket.on('unirse_reporte', async ({ reporteId }) => {
      try {
        const idNum = Number(reporteId);
        if (!idNum) return;

        socket.join(`reporte_${idNum}`);
        socket.reporteActual = idNum;

        if (!usuariosEnReporte.has(idNum)) {
          usuariosEnReporte.set(idNum, new Map());
        }
        usuariosEnReporte.get(idNum).set(socket.id, {
          usuarioId: usuario.id,
          nombre: usuario.nombre || usuario.correo,
          correo: usuario.correo,
        });

        if (!locksPorReporte.has(idNum)) {
          locksPorReporte.set(idNum, {});
        }

        const reporteRes = await serializarReporteParaSocket(idNum);
        if (!reporteRes) {
          socket.emit('error_socket', { mensaje: 'Reporte no encontrado o eliminado' });
          return;
        }

        socket.emit('reporte_cargado', {
          reporte: reporteRes,
          locks: locksPorReporte.get(idNum),
          usuariosActivos: Array.from(usuariosEnReporte.get(idNum).values()),
        });

        io.to(`reporte_${idNum}`).emit('usuarios_actualizados', {
          usuariosActivos: Array.from(usuariosEnReporte.get(idNum).values()),
        });
      } catch (error) {
        socket.emit('error_socket', { mensaje: 'Error al unirse al reporte', error: error.message });
      }
    });

    // 2. CONTROL DE LOCKS CONCURRENTES
    socket.on('lock_campo', ({ reporteId, campoKey }) => {
      const idNum = Number(reporteId);
      if (!locksPorReporte.has(idNum)) {
        locksPorReporte.set(idNum, {});
      }
      const locks = locksPorReporte.get(idNum);

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

      io.to(`reporte_${idNum}`).emit('campo_bloqueado', {
        campoKey,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre || usuario.correo,
      });
    });

    socket.on('unlock_campo', ({ reporteId, campoKey }) => {
      const idNum = Number(reporteId);
      const locks = locksPorReporte.get(idNum);
      if (locks && locks[campoKey] && locks[campoKey].usuarioId === usuario.id) {
        delete locks[campoKey];
        io.to(`reporte_${idNum}`).emit('campo_liberado', { campoKey });
      }
    });

    // 3. AGREGAR NOVEDAD VÍA SOCKET
    socket.on('agregar_novedad', async ({ reporteId, novedad }) => {
      try {
        const idNum = Number(reporteId);
        const reporte = await Reporte.findByPk(idNum);
        if (!reporte) return;

        let parsedDatosAdicionales = novedad.datos_adicionales;
        if (typeof novedad.datos_adicionales === 'string') {
          try { parsedDatosAdicionales = JSON.parse(novedad.datos_adicionales); } catch { parsedDatosAdicionales = {}; }
        }

        const nuevaNovedad = await Novedad.create({
          reporte_id: idNum,
          usuario_id: usuario.id,
          tipo: novedad.tipo || novedad.tipo_evento || 'AGUA',
          direccion: novedad.direccion || '',
          aga: novedad.aga || 'A09',
          instituciones: novedad.instituciones || '@emapagye @interagua',
          fecha: novedad.fecha ? new Date(novedad.fecha) : new Date(),
          latitud: novedad.latitud !== undefined ? Number(novedad.latitud) : -2.1894,
          longitud: novedad.longitud !== undefined ? Number(novedad.longitud) : -79.8891,
          recurso: novedad.recurso || novedad.recurso_asignado || '',
          estado: novedad.estado || novedad.estado_operativo || 'PENDIENTE',
          descripcion: novedad.descripcion || '',
          acciones: novedad.acciones || novedad.acciones_inmediatas || '',
          datos_adicionales: parsedDatosAdicionales || null,
        });

        // Registrar fotos si vienen URLs
        if (Array.isArray(novedad.fotos) && novedad.fotos.length > 0) {
          for (const url of novedad.fotos) {
            await NovedadFoto.create({ novedad_id: nuevaNovedad.id, url_foto: url });
          }
        }

        const { colaboradores, elaboradoPor } = await registrarColaboracionSocket(idNum, usuario.id);

        await Auditoria.create({
          usuario_id: usuario.id,
          accion: 'CREAR',
          tabla_afectada: 'novedad',
          registro_id: nuevaNovedad.id,
          detalles: { reporte_id: idNum, tipo: nuevaNovedad.tipo, direccion: nuevaNovedad.direccion },
        });

        const novedadRes = {
          _id: nuevaNovedad.id,
          id: nuevaNovedad.id,
          reporte_id: idNum,
          usuario_id: usuario.id,
          usuario_nombre: usuario.nombre || usuario.correo,
          tipo: nuevaNovedad.tipo,
          tipo_evento: nuevaNovedad.tipo,
          direccion: nuevaNovedad.direccion,
          aga: nuevaNovedad.aga,
          instituciones: nuevaNovedad.instituciones,
          fecha: nuevaNovedad.fecha,
          fecha_evento: nuevaNovedad.fecha ? new Date(nuevaNovedad.fecha).toISOString().split('T')[0] : '',
          hora_evento: nuevaNovedad.fecha ? new Date(nuevaNovedad.fecha).toTimeString().split(' ')[0].substring(0, 5) : '',
          latitud: nuevaNovedad.latitud,
          longitud: nuevaNovedad.longitud,
          recurso: nuevaNovedad.recurso,
          recurso_asignado: nuevaNovedad.recurso,
          estado: nuevaNovedad.estado,
          estado_operativo: nuevaNovedad.estado,
          descripcion: nuevaNovedad.descripcion,
          acciones: nuevaNovedad.acciones,
          acciones_inmediatas: nuevaNovedad.acciones,
          fotos: Array.isArray(novedad.fotos) ? novedad.fotos : [],
          datos_adicionales: nuevaNovedad.datos_adicionales,
          created_at: nuevaNovedad.created_at,
          updated_at: nuevaNovedad.updated_at,
        };

        io.to(`reporte_${idNum}`).emit('novedad_agregada', {
          novedad: novedadRes,
          colaboradores,
          elaborado_por: elaboradoPor,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al agregar novedad vía socket', error: err.message });
      }
    });

    // 4. ACTUALIZAR PARÁMETROS DEL REPORTE
    socket.on('actualizar_parametros', async ({ reporteId, parametros }) => {
      try {
        const idNum = Number(reporteId);
        const reporte = await Reporte.findByPk(idNum);
        if (!reporte) return;

        const campos = [
          'titulo', 'observaciones_generales', 'numero_rds', 'fecha',
          'hora_inicio', 'hora_fin', 'revisado_por', 'cabecera', 'periodo',
          'inocar_fecha', 'inocar_pleamar', 'inocar_bajamar'
        ];

        campos.forEach(c => {
          if (parametros[c] !== undefined) reporte[c] = parametros[c];
        });

        if (parametros.fecha_reporte !== undefined) {
          reporte.fecha = parametros.fecha_reporte;
        }

        await reporte.save();
        const { colaboradores, elaboradoPor } = await registrarColaboracionSocket(idNum, usuario.id);

        await Auditoria.create({
          usuario_id: usuario.id,
          accion: 'EDITAR',
          tabla_afectada: 'reporte',
          registro_id: idNum,
          detalles: { parametros },
        });

        io.to(`reporte_${idNum}`).emit('parametros_actualizados', {
          reporteId: idNum,
          parametros: {
            ...parametros,
            fecha_reporte: reporte.fecha,
          },
          colaboradores,
          elaborado_por: elaboradoPor,
          actualizadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al actualizar parámetros', error: err.message });
      }
    });

    // 5. ACTUALIZAR NOVEDAD VÍA SOCKET
    socket.on('actualizar_novedad', async ({ reporteId, novedadId, cambios }) => {
      try {
        const idNum = Number(reporteId);
        const novIdNum = Number(novedadId);

        const novedad = await Novedad.findOne({ where: { id: novIdNum, reporte_id: idNum } });
        if (!novedad) return;

        const campos = ['tipo', 'direccion', 'aga', 'instituciones', 'latitud', 'longitud', 'recurso', 'estado', 'descripcion', 'acciones'];
        campos.forEach(c => {
          if (cambios[c] !== undefined) novedad[c] = cambios[c];
        });

        if (cambios.tipo_evento !== undefined) novedad.tipo = cambios.tipo_evento;
        if (cambios.recurso_asignado !== undefined) novedad.recurso = cambios.recurso_asignado;
        if (cambios.estado_operativo !== undefined) novedad.estado = cambios.estado_operativo;
        if (cambios.acciones_inmediatas !== undefined) novedad.acciones = cambios.acciones_inmediatas;
        if (cambios.fecha !== undefined) novedad.fecha = new Date(cambios.fecha);
        if (cambios.fecha_evento !== undefined) novedad.fecha = new Date(cambios.fecha_evento);

        if (cambios.datos_adicionales !== undefined) {
          novedad.datos_adicionales = cambios.datos_adicionales;
        }

        await novedad.save();
        const { colaboradores, elaboradoPor } = await registrarColaboracionSocket(idNum, usuario.id);

        await Auditoria.create({
          usuario_id: usuario.id,
          accion: 'EDITAR',
          tabla_afectada: 'novedad',
          registro_id: novIdNum,
          detalles: { reporte_id: idNum, cambios },
        });

        const novedadRes = {
          _id: novedad.id,
          id: novedad.id,
          reporte_id: idNum,
          usuario_id: novedad.usuario_id,
          tipo: novedad.tipo,
          tipo_evento: novedad.tipo,
          direccion: novedad.direccion,
          aga: novedad.aga,
          instituciones: novedad.instituciones,
          fecha: novedad.fecha,
          fecha_evento: novedad.fecha ? new Date(novedad.fecha).toISOString().split('T')[0] : '',
          hora_evento: novedad.fecha ? new Date(novedad.fecha).toTimeString().split(' ')[0].substring(0, 5) : '',
          latitud: novedad.latitud,
          longitud: novedad.longitud,
          recurso: novedad.recurso,
          recurso_asignado: novedad.recurso,
          estado: novedad.estado,
          estado_operativo: novedad.estado,
          descripcion: novedad.descripcion,
          acciones: novedad.acciones,
          acciones_inmediatas: novedad.acciones,
          datos_adicionales: novedad.datos_adicionales,
        };

        io.to(`reporte_${idNum}`).emit('novedad_actualizada', {
          novedad: novedadRes,
          colaboradores,
          elaborado_por: elaboradoPor,
          actualizadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al actualizar novedad vía socket', error: err.message });
      }
    });

    // 6. ELIMINAR NOVEDAD VÍA SOCKET
    socket.on('eliminar_novedad', async ({ reporteId, novedadId }) => {
      try {
        const idNum = Number(reporteId);
        const novIdNum = Number(novedadId);

        const novedad = await Novedad.findOne({ where: { id: novIdNum, reporte_id: idNum } });
        if (!novedad) return;

        await novedad.destroy(); // Soft delete
        const { colaboradores, elaboradoPor } = await registrarColaboracionSocket(idNum, usuario.id);

        await Auditoria.create({
          usuario_id: usuario.id,
          accion: 'ELIMINAR',
          tabla_afectada: 'novedad',
          registro_id: novIdNum,
          detalles: { reporte_id: idNum, direccion: novedad.direccion },
        });

        io.to(`reporte_${idNum}`).emit('novedad_eliminada', {
          novedadId: novIdNum,
          colaboradores,
          elaborado_por: elaboradoPor,
          eliminadoPor: usuario.nombre || usuario.correo,
        });
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al eliminar novedad vía socket', error: err.message });
      }
    });

    // 7. ELIMINAR REPORTE COMPLETO VÍA SOCKET
    socket.on('eliminar_reporte', async ({ reporteId }) => {
      try {
        const idNum = Number(reporteId);
        const reporte = await Reporte.findByPk(idNum);
        if (!reporte) return;

        await reporte.destroy(); // Soft delete

        await Auditoria.create({
          usuario_id: usuario.id,
          accion: 'ELIMINAR',
          tabla_afectada: 'reporte',
          registro_id: idNum,
          detalles: { codigo: reporte.codigo, titulo: reporte.titulo },
        });

        io.to(`reporte_${idNum}`).emit('reporte_eliminado', {
          reporteId: idNum,
          eliminadoPor: usuario.nombre || usuario.correo,
        });

        locksPorReporte.delete(idNum);
        usuariosEnReporte.delete(idNum);
      } catch (err) {
        socket.emit('error_socket', { mensaje: 'Error al eliminar reporte vía socket', error: err.message });
      }
    });

    // 8. DESCONEXIÓN DE USUARIO
    socket.on('disconnect', () => {
      const reporteId = socket.reporteActual;
      if (reporteId && usuariosEnReporte.has(reporteId)) {
        usuariosEnReporte.get(reporteId).delete(socket.id);
        io.to(`reporte_${reporteId}`).emit('usuarios_actualizados', {
          usuariosActivos: Array.from(usuariosEnReporte.get(reporteId).values()),
        });

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


