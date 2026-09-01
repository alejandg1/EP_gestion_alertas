const { Op } = require('sequelize');
const { Reporte, ReporteColaborador, Novedad, NovedadFoto, Usuario, Auditoria } = require('../models');
const logger = require('../config/logger');

// Generador de código secuencial: REP-YYYYMM-XXX
const generarCodigoReporte = async () => {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `REP-${yearMonth}-`;

  const reportesMes = await Reporte.findAll({
    where: {
      codigo: { [Op.like]: `${prefix}%` }
    },
    attributes: ['codigo'],
    paranoid: false,
  });

  let maxNum = 0;
  reportesMes.forEach(r => {
    if (r.codigo) {
      const match = r.codigo.match(/-(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  });

  let siguienteNumero = maxNum + 1;
  let codigoCandidato = `${prefix}${String(siguienteNumero).padStart(3, '0')}`;

  while (await Reporte.findOne({ where: { codigo: codigoCandidato }, paranoid: false })) {
    siguienteNumero++;
    codigoCandidato = `${prefix}${String(siguienteNumero).padStart(3, '0')}`;
  }

  return codigoCandidato;
};

// Función auxiliar para registrar o actualizar colaboración en la tabla intermedia
const registrarColaboracion = async (reporteId, usuarioId) => {
  if (!reporteId || !usuarioId) return;

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

  // Actualizar string elaborado_por en el Reporte
  const colaboradores = await ReporteColaborador.findAll({
    where: { reporte_id: reporteId },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo'] }],
    order: [['primer_aporte', 'ASC']]
  });

  const nombres = colaboradores.map(c => c.usuario?.nombre || c.usuario?.correo).filter(Boolean);
  const elaboradoPor = [...new Set(nombres)].join(' – ');

  await Reporte.update({ elaborado_por: elaboradoPor }, { where: { id: reporteId } });
};

// Listar reportes
exports.listarReportes = async (req, res) => {
  try {
    const { page, limit, busqueda, fechaDesde, fechaHasta } = req.query;

    const where = {};

    if (busqueda && busqueda.trim()) {
      where[Op.or] = [
        { numero_rds: { [Op.iLike]: `%${busqueda.trim()}%` } },
        { titulo: { [Op.iLike]: `%${busqueda.trim()}%` } },
        { codigo: { [Op.iLike]: `%${busqueda.trim()}%` } },
        { elaborado_por: { [Op.iLike]: `%${busqueda.trim()}%` } },
      ];
    }

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha[Op.gte] = fechaDesde;
      if (fechaHasta) where.fecha[Op.lte] = fechaHasta;
    }

    const options = {
      where,
      order: [['fecha', 'DESC'], ['id', 'DESC']],
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
    };

    if (page && limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 15;
      options.limit = limitNum;
      options.offset = (pageNum - 1) * limitNum;

      const { count, rows } = await Reporte.findAndCountAll(options);

      return res.json({
        ok: true,
        total: count,
        pagina: pageNum,
        totalPaginas: Math.ceil(count / limitNum),
        reportes: rows,
      });
    }

    const reportes = await Reporte.findAll(options);
    return res.json({ ok: true, total: reportes.length, reportes });
  } catch (error) {
    logger.error(`Error al listar reportes: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al listar reportes', error: error.message });
  }
};

// Obtener reporte por ID
exports.obtenerReporte = async (req, res) => {
  try {
    const { id } = req.params;
    const reporte = await Reporte.findByPk(id, {
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

    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    return res.json({ ok: true, reporte });
  } catch (error) {
    logger.error(`Error al obtener reporte: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener reporte', error: error.message });
  }
};

// Crear reporte
exports.crearReporte = async (req, res) => {
  try {
    const usuarioAuth = req.usuario;
    const {
      titulo,
      observaciones_generales,
      numero_rds,
      fecha,
      hora_inicio,
      hora_fin,
      revisado_por,
      cabecera,
      periodo,
      inocar_fecha,
      inocar_pleamar,
      inocar_bajamar,
    } = req.body;

    const codigo = await generarCodigoReporte();

    let fechaFormateada = new Date().toISOString().split('T')[0];
    if (fecha) {
      const parsed = new Date(fecha);
      if (!isNaN(parsed.getTime())) {
        fechaFormateada = parsed.toISOString().split('T')[0];
      }
    }

    const nuevoReporte = await Reporte.create({
      codigo,
      titulo: titulo || 'Reporte de Novedades',
      observaciones_generales: observaciones_generales || '',
      numero_rds: numero_rds || 'SEGURA-EP-GASGEC-SS-2026-041 (Lluvias)',
      fecha: fechaFormateada,
      hora_inicio: hora_inicio || '06:00',
      hora_fin: hora_fin || '22:00',
      revisado_por: revisado_por || 'Jefe de Sala Situacional',
      cabecera: cabecera || '',
      periodo: periodo || '',
      inocar_fecha: inocar_fecha || null,
      inocar_pleamar: inocar_pleamar || null,
      inocar_bajamar: inocar_bajamar || null,
      elaborado_por: usuarioAuth ? (usuarioAuth.nombre || usuarioAuth.correo) : '',
    });

    // 1. Registrar al creador en la tabla intermedia Reporte_Colaborador
    if (usuarioAuth) {
      await ReporteColaborador.create({
        reporte_id: nuevoReporte.id,
        usuario_id: usuarioAuth.id,
        primer_aporte: new Date(),
        ultimo_aporte: new Date(),
        total_ediciones: 1,
      });
    }

    // 2. Registrar en Auditoria
    await Auditoria.create({
      usuario_id: usuarioAuth ? usuarioAuth.id : null,
      accion: 'CREAR',
      tabla_afectada: 'reporte',
      registro_id: nuevoReporte.id,
      detalles: { codigo: nuevoReporte.codigo, titulo: nuevoReporte.titulo },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    const reporteCompleto = await Reporte.findByPk(nuevoReporte.id, {
      include: [
        {
          model: ReporteColaborador,
          as: 'reporte_colaboradores',
          include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo', 'rol'] }]
        }
      ]
    });

    return res.status(201).json({ ok: true, mensaje: 'Reporte creado exitosamente', reporte: reporteCompleto });
  } catch (error) {
    logger.error(`Error al crear reporte: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al crear reporte', error: error.message });
  }
};

// Actualizar parámetros institucionales del reporte
exports.actualizarParametros = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioAuth = req.usuario;
    const reporte = await Reporte.findByPk(id);

    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    const campos = [
      'titulo', 'observaciones_generales', 'numero_rds', 'fecha',
      'hora_inicio', 'hora_fin', 'revisado_por', 'cabecera', 'periodo',
      'inocar_fecha', 'inocar_pleamar', 'inocar_bajamar'
    ];

    const cambios = {};
    campos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        if (campo === 'fecha' && req.body[campo]) {
          const parsed = new Date(req.body[campo]);
          if (!isNaN(parsed.getTime())) {
            reporte[campo] = parsed.toISOString().split('T')[0];
            cambios[campo] = reporte[campo];
            return;
          }
        }
        reporte[campo] = req.body[campo];
        cambios[campo] = req.body[campo];
      }
    });

    await reporte.save();

    // 1. Actualizar tabla intermedia Reporte_Colaborador y recalculado de elaborado_por
    if (usuarioAuth) {
      await registrarColaboracion(reporte.id, usuarioAuth.id);
    }

    // 2. Registrar en Auditoria
    await Auditoria.create({
      usuario_id: usuarioAuth ? usuarioAuth.id : null,
      accion: 'EDITAR',
      tabla_afectada: 'reporte',
      registro_id: reporte.id,
      detalles: { cambios },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    const reporteActualizado = await Reporte.findByPk(reporte.id, {
      include: [
        {
          model: ReporteColaborador,
          as: 'reporte_colaboradores',
          include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo', 'rol'] }]
        }
      ]
    });

    return res.json({ ok: true, mensaje: 'Parámetros actualizados exitosamente', reporte: reporteActualizado });
  } catch (error) {
    logger.error(`Error al actualizar reporte: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar reporte', error: error.message });
  }
};

// Agregar novedad a un reporte específico
exports.agregarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const datos = req.body;

    const reporte = await Reporte.findByPk(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    let parsedDatosAdicionales = datos.datos_adicionales;
    if (typeof datos.datos_adicionales === 'string') {
      try { parsedDatosAdicionales = JSON.parse(datos.datos_adicionales); } catch { parsedDatosAdicionales = {}; }
    }

    const nuevaNovedad = await Novedad.create({
      reporte_id: reporte.id,
      usuario_id: usuario.id,
      tipo: datos.tipo || datos.tipo_evento || 'AGUA',
      direccion: datos.direccion || '',
      aga: datos.aga || 'A09',
      instituciones: datos.instituciones || '@emapagye @interagua',
      fecha: datos.fecha ? new Date(datos.fecha) : new Date(),
      latitud: datos.latitud !== undefined ? Number(datos.latitud) : -2.1894,
      longitud: datos.longitud !== undefined ? Number(datos.longitud) : -79.8891,
      recurso: datos.recurso || datos.recurso_asignado || '',
      estado: datos.estado || datos.estado_operativo || 'PENDIENTE',
      descripcion: datos.descripcion || '',
      acciones: datos.acciones || datos.acciones_inmediatas || '',
      datos_adicionales: parsedDatosAdicionales || null,
    });

    if (req.files && req.files.length > 0) {
      const fotosPromises = req.files.map(f =>
        NovedadFoto.create({
          novedad_id: nuevaNovedad.id,
          url_foto: `/uploads/fotos/${f.filename}`,
          nombre_archivo: f.originalname,
        })
      );
      await Promise.all(fotosPromises);
    }

    // 1. Registrar/Actualizar al usuario en la tabla intermedia Reporte_Colaborador
    await registrarColaboracion(reporte.id, usuario.id);

    // 2. Registrar en Auditoria
    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'CREAR',
      tabla_afectada: 'novedad',
      registro_id: nuevaNovedad.id,
      detalles: { reporte_id: reporte.id, tipo: nuevaNovedad.tipo, direccion: nuevaNovedad.direccion },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    const novedadCompleta = await Novedad.findByPk(nuevaNovedad.id, {
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo'] },
        { model: NovedadFoto, as: 'fotos' }
      ]
    });

    return res.status(201).json({
      ok: true,
      mensaje: 'Novedad agregada exitosamente al reporte',
      novedad: novedadCompleta,
    });
  } catch (error) {
    logger.error(`Error al agregar novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al agregar novedad', error: error.message });
  }
};

// Actualizar novedad de un reporte
exports.actualizarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const usuario = req.usuario;

    const novedad = await Novedad.findOne({ where: { id: novedadId, reporte_id: id } });
    if (!novedad) {
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada en este reporte' });
    }

    const campos = ['tipo', 'direccion', 'aga', 'instituciones', 'latitud', 'longitud', 'recurso', 'estado', 'descripcion', 'acciones'];
    campos.forEach(c => {
      if (req.body[c] !== undefined) novedad[c] = req.body[c];
    });

    if (req.body.fecha !== undefined) novedad.fecha = new Date(req.body.fecha);

    if (req.body.datos_adicionales !== undefined) {
      let parsed = req.body.datos_adicionales;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      novedad.datos_adicionales = parsed;
    }

    await novedad.save();

    if (req.files && req.files.length > 0) {
      const fotosPromises = req.files.map(f =>
        NovedadFoto.create({
          novedad_id: novedad.id,
          url_foto: `/uploads/fotos/${f.filename}`,
          nombre_archivo: f.originalname,
        })
      );
      await Promise.all(fotosPromises);
    }

    // 1. Actualizar colaboración en Reporte_Colaborador
    await registrarColaboracion(Number(id), usuario.id);

    // 2. Registrar en Auditoria
    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'EDITAR',
      tabla_afectada: 'novedad',
      registro_id: novedad.id,
      detalles: { reporte_id: Number(id), estado: novedad.estado },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    const novedadActualizada = await Novedad.findByPk(novedad.id, {
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo'] },
        { model: NovedadFoto, as: 'fotos' }
      ]
    });

    return res.json({
      ok: true,
      mensaje: 'Novedad actualizada exitosamente',
      novedad: novedadActualizada,
    });
  } catch (error) {
    logger.error(`Error al actualizar novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar novedad', error: error.message });
  }
};

// Eliminar novedad de un reporte (Soft Delete)
exports.eliminarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const usuario = req.usuario;

    const novedad = await Novedad.findOne({ where: { id: novedadId, reporte_id: id } });
    if (!novedad) {
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada en este reporte' });
    }

    await novedad.destroy();

    // Actualizar colaboración en Reporte_Colaborador
    await registrarColaboracion(Number(id), usuario.id);

    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'ELIMINAR',
      tabla_afectada: 'novedad',
      registro_id: novedadId,
      detalles: { reporte_id: Number(id), direccion: novedad.direccion },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    return res.json({
      ok: true,
      mensaje: 'Novedad eliminada exitosamente (soft delete)',
      novedad_id: Number(novedadId),
    });
  } catch (error) {
    logger.error(`Error al eliminar novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar novedad', error: error.message });
  }
};

// Eliminar reporte completo (Soft Delete)
exports.eliminarReporte = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const reporte = await Reporte.findByPk(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    await reporte.destroy();

    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'ELIMINAR',
      tabla_afectada: 'reporte',
      registro_id: id,
      detalles: { codigo: reporte.codigo, titulo: reporte.titulo },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    return res.json({
      ok: true,
      mensaje: 'Reporte eliminado exitosamente (soft delete)',
      id: Number(id),
    });
  } catch (error) {
    logger.error(`Error al eliminar reporte: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar reporte', error: error.message });
  }
};

// Subida independiente de fotos
exports.subirFotos = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, mensaje: 'No se enviaron archivos de imagen' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const rutasFotos = req.files.map(file => `/uploads/fotos/${file.filename}`);
    const urlsCompletas = req.files.map(file => `${protocol}://${host}/uploads/fotos/${file.filename}`);

    return res.status(201).json({
      ok: true,
      mensaje: `${req.files.length} fotografía(s) guardada(s) exitosamente`,
      fotos: rutasFotos,
      urls: urlsCompletas,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al procesar subida de fotos', error: error.message });
  }
};
