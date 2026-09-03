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

    logger.info('[REPORTES] Solicitud para listar reportes recibida en la API', {
      usuario: req.usuario ? { id: req.usuario.id, correo: req.usuario.correo, rol: req.usuario.rol } : null,
      filtros: { page, limit, busqueda, fechaDesde, fechaHasta }
    });

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
      distinct: true,
      col: 'id',
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

      logger.info(`[REPORTES] Listado paginado obtenido: ${rows.length} reportes de ${count} totales`, {
        pagina: pageNum,
        total: count
      });

      return res.json({
        ok: true,
        total: count,
        pagina: pageNum,
        totalPaginas: Math.ceil(count / limitNum),
        reportes: rows,
      });
    }

    const reportes = await Reporte.findAll(options);
    logger.info(`[REPORTES] Listado completo obtenido: ${reportes.length} reportes`);
    return res.json({ ok: true, total: reportes.length, reportes });
  } catch (error) {
    logger.error(`Error al listar reportes: ${error.message}`, { stack: error.stack, query: req.query });
    return res.status(500).json({ ok: false, mensaje: 'Error al listar reportes', error: error.message });
  }
};

// Obtener reporte por ID
exports.obtenerReporte = async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`[REPORTES] Solicitud para consultar reporte ID: ${id} recibida`, {
      reporteId: id,
      usuario: req.usuario ? { id: req.usuario.id, correo: req.usuario.correo } : null
    });

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
      logger.warn(`[REPORTES] Reporte no encontrado (ID: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    logger.info(`[REPORTES] Reporte ID: ${id} obtenido con éxito (Código: ${reporte.codigo}, Novedades: ${reporte.novedades?.length || 0})`);
    return res.json({ ok: true, reporte });
  } catch (error) {
    logger.error(`Error al obtener reporte: ${error.message}`, { stack: error.stack, reporteId: req.params.id });
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener reporte', error: error.message });
  }
};

// Crear reporte
exports.crearReporte = async (req, res) => {
  try {
    const usuarioAuth = req.usuario;

    logger.info('[REPORTES] Solicitud para crear reporte recibida en la API', {
      usuario: usuarioAuth ? { id: usuarioAuth.id, nombre: usuarioAuth.nombre, correo: usuarioAuth.correo } : null,
      bodyRecibido: req.body
    });

    const {
      tipo_reporte,
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
      tipo_reporte: tipo_reporte && ['epoca_lluvias', 'epoca_seca'].includes(tipo_reporte) ? tipo_reporte : 'epoca_lluvias',
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

    logger.info(`[REPORTES] Reporte creado exitosamente con ID: ${nuevoReporte.id} (Código: ${nuevoReporte.codigo})`, {
      reporteId: nuevoReporte.id,
      codigo: nuevoReporte.codigo,
      tipo_reporte: nuevoReporte.tipo_reporte,
      titulo: nuevoReporte.titulo
    });

    return res.status(201).json({ ok: true, mensaje: 'Reporte creado exitosamente', reporte: reporteCompleto });
  } catch (error) {
    logger.error(`Error al crear reporte: ${error.message}`, { stack: error.stack, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al crear reporte', error: error.message });
  }
};

// Actualizar parámetros institucionales del reporte
exports.actualizarParametros = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioAuth = req.usuario;

    logger.info(`[REPORTES] Solicitud para actualizar parámetros de reporte ID: ${id} recibida en la API`, {
      reporteId: id,
      usuario: usuarioAuth ? { id: usuarioAuth.id, nombre: usuarioAuth.nombre, correo: usuarioAuth.correo } : null,
      bodyRecibido: req.body
    });

    const reporte = await Reporte.findByPk(id);

    if (!reporte) {
      logger.warn(`[REPORTES] Intento de actualizar parámetros en reporte inexistente (ID: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    const campos = [
      'tipo_reporte', 'titulo', 'observaciones_generales', 'numero_rds', 'fecha',
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

    logger.info(`[REPORTES] Parámetros de reporte ID: ${id} actualizados exitosamente`, {
      reporteId: id,
      cambiosRealizados: cambios
    });

    return res.json({ ok: true, mensaje: 'Parámetros actualizados exitosamente', reporte: reporteActualizado });
  } catch (error) {
    logger.error(`Error al actualizar reporte: ${error.message}`, { stack: error.stack, reporteId: req.params.id, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar reporte', error: error.message });
  }
};

// Agregar novedad a un reporte específico
exports.agregarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const datos = req.body;

    const archivosAdjuntos = (req.files || []).map(f => ({
      originalname: f.originalname,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype
    }));

    logger.info(`[REPORTES] Solicitud para agregar novedad a reporte ID: ${id} recibida en la API`, {
      reporteId: id,
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null,
      bodyRecibido: req.body,
      archivosRecibidos: archivosAdjuntos
    });

    const reporte = await Reporte.findByPk(id);
    if (!reporte) {
      logger.warn(`[REPORTES] Intento de agregar novedad a reporte inexistente (ID: ${id})`);
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

    let fotosArray = req.body.fotos || datos.fotos;
    if (typeof fotosArray === 'string') {
      try { fotosArray = JSON.parse(fotosArray); } catch { fotosArray = [fotosArray]; }
    }

    if (req.files && req.files.length > 0) {
      const fotosPromises = req.files.map(f =>
        NovedadFoto.create({
          novedad_id: nuevaNovedad.id,
          url_foto: `/uploads/fotos/${f.filename}`,
          nombre_archivo: f.originalname,
        })
      );
      await Promise.all(fotosPromises);
    } else if (Array.isArray(fotosArray) && fotosArray.length > 0) {
      const fotosPromises = fotosArray.map(fotoItem => {
        const urlStr = typeof fotoItem === 'string' ? fotoItem : (fotoItem.url_foto || fotoItem.url || fotoItem.path || '');
        if (!urlStr) return null;
        return NovedadFoto.create({
          novedad_id: nuevaNovedad.id,
          url_foto: urlStr,
          nombre_archivo: urlStr.split('/').pop() || 'foto.jpg',
        });
      }).filter(Boolean);
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

    logger.info(`[REPORTES] Novedad agregada exitosamente al reporte ID: ${id} con ID novedad: ${nuevaNovedad.id}`, {
      reporteId: id,
      novedadId: nuevaNovedad.id,
      tipo: nuevaNovedad.tipo,
      direccion: nuevaNovedad.direccion
    });

    return res.status(201).json({
      ok: true,
      mensaje: 'Novedad agregada exitosamente al reporte',
      novedad: novedadCompleta,
    });
  } catch (error) {
    logger.error(`Error al agregar novedad: ${error.message}`, { stack: error.stack, reporteId: req.params.id, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al agregar novedad', error: error.message });
  }
};

// Actualizar novedad de un reporte
exports.actualizarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const usuario = req.usuario;

    const archivosAdjuntos = (req.files || []).map(f => ({
      originalname: f.originalname,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype
    }));

    logger.info(`[REPORTES] Solicitud para actualizar novedad ID: ${novedadId} en reporte ID: ${id} recibida en la API`, {
      reporteId: id,
      novedadId,
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null,
      bodyRecibido: req.body,
      archivosRecibidos: archivosAdjuntos
    });

    const novedad = await Novedad.findOne({ where: { id: novedadId, reporte_id: id } });
    if (!novedad) {
      logger.warn(`[REPORTES] Novedad no encontrada en reporte (ID Novedad: ${novedadId}, ID Reporte: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada en este reporte' });
    }

    const {
      tipo,
      tipo_evento,
      direccion,
      aga,
      instituciones,
      fecha,
      latitud,
      longitud,
      recurso,
      recurso_asignado,
      estado,
      estado_operativo,
      descripcion,
      acciones,
      acciones_inmediatas,
      hora_sitio,
      solucionado,
      datos_adicionales,
      recursos_instituciones,
      personal_instituciones
    } = req.body;

    if (tipo !== undefined) novedad.tipo = tipo;
    if (tipo_evento !== undefined) novedad.tipo = tipo_evento;
    if (direccion !== undefined) novedad.direccion = direccion;
    if (aga !== undefined) novedad.aga = aga;
    if (instituciones !== undefined) novedad.instituciones = instituciones;
    if (fecha !== undefined) novedad.fecha = new Date(fecha);
    if (latitud !== undefined) novedad.latitud = Number(latitud);
    if (longitud !== undefined) novedad.longitud = Number(longitud);
    if (recurso !== undefined) novedad.recurso = recurso;
    if (recurso_asignado !== undefined) novedad.recurso = recurso_asignado;
    if (estado !== undefined) novedad.estado = estado;
    if (estado_operativo !== undefined) novedad.estado = estado_operativo;
    if (descripcion !== undefined) novedad.descripcion = descripcion;
    if (acciones !== undefined) novedad.acciones = acciones;
    if (acciones_inmediatas !== undefined) novedad.acciones = acciones_inmediatas;
    
    // Solo asignar hora manual si tiene contenido real (no vacía)
    if (hora_sitio !== undefined && hora_sitio !== null && String(hora_sitio).trim() !== '') {
      novedad.hora_sitio = String(hora_sitio).trim();
    }
    if (solucionado !== undefined && solucionado !== null && String(solucionado).trim() !== '') {
      novedad.solucionado = String(solucionado).trim();
    }

    let currentDatos = novedad.datos_adicionales ? JSON.parse(JSON.stringify(novedad.datos_adicionales)) : {};
    if (datos_adicionales !== undefined) {
      let parsed = datos_adicionales;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      currentDatos = { ...currentDatos, ...parsed };
    }

    if (recursos_instituciones !== undefined) {
      let parsedRec = recursos_instituciones;
      if (typeof parsedRec === 'string') {
        try { parsedRec = JSON.parse(parsedRec); } catch { }
      }
      currentDatos.recursos = parsedRec;
    }
    if (personal_instituciones !== undefined) {
      let parsedPers = personal_instituciones;
      if (typeof parsedPers === 'string') {
        try { parsedPers = JSON.parse(parsedPers); } catch { }
      }
      currentDatos.personal = parsedPers;
    }

    novedad.set('datos_adicionales', currentDatos);
    novedad.changed('datos_adicionales', true);

    await novedad.save();

    let fotosActualizar = req.body.fotos;
    if (typeof fotosActualizar === 'string') {
      try { fotosActualizar = JSON.parse(fotosActualizar); } catch { fotosActualizar = [fotosActualizar]; }
    }

    if (req.files && req.files.length > 0) {
      const fotosPromises = req.files.map(f =>
        NovedadFoto.create({
          novedad_id: novedad.id,
          url_foto: `/uploads/fotos/${f.filename}`,
          nombre_archivo: f.originalname,
        })
      );
      await Promise.all(fotosPromises);
    } else if (fotosActualizar !== undefined && Array.isArray(fotosActualizar)) {
      // Sincronizar fotos: eliminar fotos existentes y registrar las actuales
      await NovedadFoto.destroy({ where: { novedad_id: novedad.id } });
      const fotosPromises = fotosActualizar.map(fotoItem => {
        const urlStr = typeof fotoItem === 'string' ? fotoItem : (fotoItem.url_foto || fotoItem.url || fotoItem.path || '');
        if (!urlStr) return null;
        return NovedadFoto.create({
          novedad_id: novedad.id,
          url_foto: urlStr,
          nombre_archivo: urlStr.split('/').pop() || 'foto.jpg',
        });
      }).filter(Boolean);
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

    logger.info(`[REPORTES] Novedad ID: ${novedadId} en reporte ID: ${id} actualizada exitosamente`, {
      reporteId: id,
      novedadId,
      estado: novedad.estado,
      tipo: novedad.tipo
    });

    return res.json({
      ok: true,
      mensaje: 'Novedad actualizada exitosamente',
      novedad: novedadActualizada,
    });
  } catch (error) {
    logger.error(`Error al actualizar novedad: ${error.message}`, { stack: error.stack, reporteId: req.params.id, novedadId: req.params.novedadId, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar novedad', error: error.message });
  }
};

// Eliminar novedad de un reporte (Soft Delete)
exports.eliminarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const usuario = req.usuario;

    logger.info(`[REPORTES] Solicitud para eliminar novedad ID: ${novedadId} de reporte ID: ${id} recibida en la API`, {
      reporteId: id,
      novedadId,
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null
    });

    const novedad = await Novedad.findOne({ where: { id: novedadId, reporte_id: id } });
    if (!novedad) {
      logger.warn(`[REPORTES] Intento de eliminar novedad no encontrada en reporte (ID Novedad: ${novedadId}, ID Reporte: ${id})`);
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

    logger.info(`[REPORTES] Novedad ID: ${novedadId} eliminada exitosamente del reporte ID: ${id} (soft delete)`);

    return res.json({
      ok: true,
      mensaje: 'Novedad eliminada exitosamente (soft delete)',
      novedad_id: Number(novedadId),
    });
  } catch (error) {
    logger.error(`Error al eliminar novedad: ${error.message}`, { stack: error.stack, reporteId: req.params.id, novedadId: req.params.novedadId });
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar novedad', error: error.message });
  }
};

// Eliminar reporte completo (Soft Delete)
exports.eliminarReporte = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    logger.info(`[REPORTES] Solicitud para eliminar reporte ID: ${id} recibida en la API`, {
      reporteId: id,
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null
    });

    const reporte = await Reporte.findByPk(id);
    if (!reporte) {
      logger.warn(`[REPORTES] Intento de eliminar reporte inexistente (ID: ${id})`);
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

    logger.info(`[REPORTES] Reporte ID: ${id} eliminado exitosamente (soft delete)`);

    return res.json({
      ok: true,
      mensaje: 'Reporte eliminado exitosamente (soft delete)',
      id: Number(id),
    });
  } catch (error) {
    logger.error(`Error al eliminar reporte: ${error.message}`, { stack: error.stack, reporteId: req.params.id });
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar reporte', error: error.message });
  }
};

// Subida independiente de fotos
exports.subirFotos = async (req, res) => {
  try {
    const usuario = req.usuario;
    const archivosAdjuntos = (req.files || []).map(f => ({
      originalname: f.originalname,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype
    }));

    logger.info('[REPORTES] Solicitud de subida de fotos recibida en la API', {
      usuario: usuario ? { id: usuario.id, correo: usuario.correo } : null,
      cantidadArchivos: req.files ? req.files.length : 0,
      archivos: archivosAdjuntos
    });

    if (!req.files || req.files.length === 0) {
      logger.warn('[REPORTES] Subida de fotos rechazada: No se enviaron archivos de imagen');
      return res.status(400).json({ ok: false, mensaje: 'No se enviaron archivos de imagen' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const rutasFotos = req.files.map(file => `/uploads/fotos/${file.filename}`);
    const urlsCompletas = req.files.map(file => `${protocol}://${host}/uploads/fotos/${file.filename}`);

    logger.info(`[REPORTES] ${req.files.length} fotografía(s) guardada(s) exitosamente`, {
      rutas: rutasFotos
    });

    return res.status(201).json({
      ok: true,
      mensaje: `${req.files.length} fotografía(s) guardada(s) exitosamente`,
      fotos: rutasFotos,
      urls: urlsCompletas,
    });
  } catch (error) {
    logger.error(`Error al procesar subida de fotos: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al procesar subida de fotos', error: error.message });
  }
};

/**
 * Obtener métricas y KPIs de tiempos de respuesta consolidados para un reporte específico
 */
exports.obtenerMetricasTiemposReporte = async (req, res) => {
  try {
    const { id } = req.params;

    logger.info(`[REPORTES] Solicitud para obtener métricas de tiempos del reporte ID: ${id} recibida`, {
      reporteId: id,
      usuario: req.usuario ? { id: req.usuario.id, correo: req.usuario.correo } : null
    });

    const reporte = await Reporte.findByPk(id, {
      include: [
        {
          model: Novedad,
          as: 'novedades',
          attributes: ['id', 'tipo', 'aga', 'fecha', 'hora_sitio', 'tiempo_respuesta', 'solucionado', 'tiempo_atencion', 'datos_adicionales'],
        }
      ]
    });

    if (!reporte) {
      logger.warn(`[REPORTES] Reporte no encontrado para calcular métricas (ID: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    const { generarMetricasTiempos } = require('../services/calculosOperativosService');
    const metricas = generarMetricasTiempos(reporte.novedades || []);

    // Actualizar tiempo_respuesta_promedio en el reporte si cambió
    if (metricas.tiempo_respuesta_promedio_minutos !== reporte.tiempo_respuesta_promedio) {
      await reporte.update({ tiempo_respuesta_promedio: metricas.tiempo_respuesta_promedio_minutos });
    }

    logger.info(`[REPORTES] Métricas generadas exitosamente para reporte ID: ${id} (${reporte.novedades?.length || 0} novedades)`, {
      reporteId: id,
      tiempo_promedio: metricas.tiempo_respuesta_promedio_minutos
    });

    return res.json({
      ok: true,
      reporte_id: reporte.id,
      codigo: reporte.codigo,
      tipo_reporte: reporte.tipo_reporte,
      metricas,
    });
  } catch (error) {
    logger.error(`Error al obtener métricas de reporte ${req.params.id}: ${error.message}`, { stack: error.stack, reporteId: req.params.id });
    return res.status(500).json({ ok: false, mensaje: 'Error al calcular métricas de tiempos', error: error.message });
  }
};
