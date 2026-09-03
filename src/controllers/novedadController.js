const { Op } = require('sequelize');
const { Novedad, NovedadFoto, Usuario, Reporte, ReporteColaborador, Auditoria } = require('../models');
const logger = require('../config/logger');

// Función auxiliar para registrar colaboración
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

  const colaboradores = await ReporteColaborador.findAll({
    where: { reporte_id: reporteId },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo'] }],
    order: [['primer_aporte', 'ASC']]
  });

  const nombres = colaboradores.map(c => c.usuario?.nombre || c.usuario?.correo).filter(Boolean);
  const elaboradoPor = [...new Set(nombres)].join(' – ');

  await Reporte.update({ elaborado_por: elaboradoPor }, { where: { id: reporteId } });
};


exports.listarNovedades = async (req, res) => {
  try {
    const { page, limit, tipo, estado, busqueda, fechaDesde, fechaHasta, soloHistoricos } = req.query;

    logger.info('[NOVEDADES] Solicitud para listar novedades recibida', {
      usuario: req.usuario ? { id: req.usuario.id, correo: req.usuario.correo, rol: req.usuario.rol } : null,
      filtros: { page, limit, tipo, estado, busqueda, fechaDesde, fechaHasta, soloHistoricos }
    });

    const where = {};

    if (tipo) {
      where.tipo = tipo;
    }

    if (estado) {
      where.estado = estado;
    }

    if (soloHistoricos === 'true') {
      where.reporte_id = null;
    }

    // Eliminación estrictamente lógica (Soft delete usando deletedAt de Sequelize)
    if (busqueda && busqueda.trim()) {
      where[Op.or] = [
        { direccion: { [Op.iLike]: `%${busqueda.trim()}%` } },
        { descripcion: { [Op.iLike]: `%${busqueda.trim()}%` } },
        { aga: { [Op.iLike]: `%${busqueda.trim()}%` } },
        { recurso: { [Op.iLike]: `%${busqueda.trim()}%` } },
      ];
    }

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha[Op.gte] = new Date(fechaDesde);
      if (fechaHasta) where.fecha[Op.lte] = new Date(fechaHasta);
    }

    const options = {
      where,
      distinct: true,
      col: 'id',
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      include: [
        {
          model: Usuario,
          as: 'usuario',
          attributes: ['id', 'nombre', 'correo', 'rol'],
        },
        {
          model: NovedadFoto,
          as: 'fotos',
          attributes: ['id', 'url_foto', 'nombre_archivo', 'created_at'],
        }
      ]
    };

    if (page && limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 15;
      const offset = (pageNum - 1) * limitNum;

      options.limit = limitNum;
      options.offset = offset;

      const { count, rows } = await Novedad.findAndCountAll(options);

      logger.info(`[NOVEDADES] Listado paginado obtenido: ${rows.length} novedades de ${count} totales`, {
        pagina: pageNum,
        total: count
      });

      return res.json({
        ok: true,
        total: count,
        pagina: pageNum,
        totalPaginas: Math.ceil(count / limitNum),
        novedades: rows,
      });
    }

    const novedades = await Novedad.findAll(options);
    logger.info(`[NOVEDADES] Listado completo obtenido: ${novedades.length} novedades`);
    return res.json({
      ok: true,
      total: novedades.length,
      novedades,
    });
  } catch (error) {
    logger.error(`Error al listar novedades: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al listar novedades', error: error.message });
  }
};

exports.obtenerNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`[NOVEDADES] Solicitud para consultar novedad ID: ${id}`, {
      novedadId: id,
      usuario: req.usuario ? { id: req.usuario.id, correo: req.usuario.correo } : null
    });

    const novedad = await Novedad.findByPk(id, {
      include: [
        {
          model: Usuario,
          as: 'usuario',
          attributes: ['id', 'nombre', 'correo', 'rol'],
        },
        {
          model: NovedadFoto,
          as: 'fotos',
          attributes: ['id', 'url_foto', 'nombre_archivo', 'created_at'],
        }
      ]
    });

    if (!novedad) {
      logger.warn(`[NOVEDADES] Novedad no encontrada (ID: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada' });
    }

    logger.info(`[NOVEDADES] Novedad encontrada con éxito (ID: ${id})`);
    return res.json({ ok: true, novedad });
  } catch (error) {
    logger.error(`Error al obtener novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener novedad', error: error.message });
  }
};

exports.crearNovedad = async (req, res) => {
  try {
    const usuario = req.usuario;
    const archivosAdjuntos = (req.files || []).map(f => ({
      originalname: f.originalname,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype
    }));

    logger.info('[NOVEDADES] Solicitud para crear novedad recibida en la API', {
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null,
      bodyRecibido: req.body,
      archivosRecibidos: archivosAdjuntos
    });

    const {
      tipo,
      direccion,
      aga,
      instituciones,
      fecha,
      latitud,
      longitud,
      recurso,
      estado,
      descripcion,
      acciones,
      datos_adicionales,
      reporte_id
    } = req.body;

    let parsedDatosAdicionales = datos_adicionales;
    if (typeof datos_adicionales === 'string') {
      try {
        parsedDatosAdicionales = JSON.parse(datos_adicionales);
      } catch {
        parsedDatosAdicionales = {};
      }
    }
    if (!parsedDatosAdicionales || typeof parsedDatosAdicionales !== 'object') {
      parsedDatosAdicionales = {};
    }

    if (req.body.recursos_instituciones) {
      let recInst = req.body.recursos_instituciones;
      if (typeof recInst === 'string') {
        try { recInst = JSON.parse(recInst); } catch { }
      }
      parsedDatosAdicionales.recursos = recInst;
    }

    if (req.body.personal_instituciones || req.body.personal) {
      let persInst = req.body.personal_instituciones || req.body.personal;
      if (typeof persInst === 'string') {
        try { persInst = JSON.parse(persInst); } catch { }
      }
      parsedDatosAdicionales.personal = persInst;
    }

    const nuevaNovedad = await Novedad.create({
      usuario_id: usuario.id,
      reporte_id: reporte_id || null,
      tipo: tipo || 'AGUA',
      direccion: direccion || '',
      aga: aga || 'A09',
      instituciones: instituciones || '@emapagye @interagua',
      fecha: fecha ? new Date(fecha) : new Date(),
      latitud: latitud !== undefined && latitud !== null ? Number(latitud) : -2.1894,
      longitud: longitud !== undefined && longitud !== null ? Number(longitud) : -79.8891,
      recurso: recurso || '',
      estado: estado || 'PENDIENTE',
      descripcion: descripcion || '',
      acciones: acciones || '',
      hora_sitio: req.body.hora_sitio || null,
      solucionado: req.body.solucionado || null,
      datos_adicionales: Object.keys(parsedDatosAdicionales).length > 0 ? parsedDatosAdicionales : null,
    });

    // Guardar fotos si vienen en multipart/form-data o en JSON
    if (req.files && req.files.length > 0) {
      const fotosPromises = req.files.map(f =>
        NovedadFoto.create({
          novedad_id: nuevaNovedad.id,
          url_foto: `/uploads/fotos/${f.filename}`,
          nombre_archivo: f.originalname,
        })
      );
      await Promise.all(fotosPromises);
    } else if (req.body.fotos && Array.isArray(req.body.fotos) && req.body.fotos.length > 0) {
      const fotosPromises = req.body.fotos.map(fotoItem => {
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

    // Si la novedad está asignada a un reporte, registrar al usuario como colaborador
    if (nuevaNovedad.reporte_id) {
      await registrarColaboracion(nuevaNovedad.reporte_id, usuario.id);
    }

    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'CREAR',
      tabla_afectada: 'novedad',
      registro_id: nuevaNovedad.id,
      detalles: {
        tipo: nuevaNovedad.tipo,
        direccion: nuevaNovedad.direccion,
      },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    const novedadCompleta = await Novedad.findByPk(nuevaNovedad.id, {
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo', 'rol'] },
        { model: NovedadFoto, as: 'fotos' }
      ]
    });

    logger.info(`[NOVEDADES] Novedad creada exitosamente con ID: ${nuevaNovedad.id}`, {
      novedadId: nuevaNovedad.id,
      tipo: nuevaNovedad.tipo,
      direccion: nuevaNovedad.direccion,
      reporteId: nuevaNovedad.reporte_id,
      estado: nuevaNovedad.estado
    });

    return res.status(201).json({
      ok: true,
      mensaje: 'Novedad registrada exitosamente',
      novedad: novedadCompleta,
    });
  } catch (error) {
    logger.error(`Error al crear novedad: ${error.message}`, { stack: error.stack, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al crear novedad', error: error.message });
  }
};

exports.actualizarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const archivosAdjuntos = (req.files || []).map(f => ({
      originalname: f.originalname,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype
    }));

    logger.info(`[NOVEDADES] Solicitud para actualizar novedad ID: ${id} recibida en la API`, {
      novedadId: id,
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null,
      bodyRecibido: req.body,
      archivosRecibidos: archivosAdjuntos
    });

    const novedad = await Novedad.findByPk(id);

    if (!novedad) {
      logger.warn(`[NOVEDADES] Intento de actualizar novedad inexistente (ID: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada' });
    }

    const {
      tipo,
      direccion,
      aga,
      instituciones,
      fecha,
      latitud,
      longitud,
      recurso,
      estado,
      descripcion,
      acciones,
      hora_sitio,
      solucionado,
      datos_adicionales,
      recursos_instituciones,
      reporte_id
    } = req.body;

    if (tipo !== undefined) novedad.tipo = tipo;
    if (direccion !== undefined) novedad.direccion = direccion;
    if (aga !== undefined) novedad.aga = aga;
    if (instituciones !== undefined) novedad.instituciones = instituciones;
    if (fecha !== undefined) novedad.fecha = new Date(fecha);
    if (latitud !== undefined) novedad.latitud = Number(latitud);
    if (longitud !== undefined) novedad.longitud = Number(longitud);
    if (recurso !== undefined) novedad.recurso = recurso;
    if (estado !== undefined) novedad.estado = estado;
    if (descripcion !== undefined) novedad.descripcion = descripcion;
    if (acciones !== undefined) novedad.acciones = acciones;
    if (hora_sitio !== undefined) novedad.hora_sitio = hora_sitio;
    if (solucionado !== undefined) novedad.solucionado = solucionado;
    if (reporte_id !== undefined) novedad.reporte_id = reporte_id;

    let currentDatos = novedad.datos_adicionales ? JSON.parse(JSON.stringify(novedad.datos_adicionales)) : {};
    if (datos_adicionales !== undefined) {
      let parsed = datos_adicionales;
      if (typeof datos_adicionales === 'string') {
        try { parsed = JSON.parse(datos_adicionales); } catch { parsed = {}; }
      }
      currentDatos = { ...currentDatos, ...parsed };
    }

    if (recursos_instituciones !== undefined) {
      let recInst = recursos_instituciones;
      if (typeof recInst === 'string') {
        try { recInst = JSON.parse(recInst); } catch { }
      }
      currentDatos.recursos = recInst;
    }

    if (req.body.personal_instituciones !== undefined || req.body.personal !== undefined) {
      let persInst = req.body.personal_instituciones !== undefined ? req.body.personal_instituciones : req.body.personal;
      if (typeof persInst === 'string') {
        try { persInst = JSON.parse(persInst); } catch { }
      }
      currentDatos.personal = persInst;
    }

    novedad.set('datos_adicionales', currentDatos);
    novedad.changed('datos_adicionales', true);

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
    } else if (req.body.fotos !== undefined && Array.isArray(req.body.fotos)) {
      await NovedadFoto.destroy({ where: { novedad_id: novedad.id } });
      const fotosPromises = req.body.fotos.map(fotoItem => {
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

    // Registrar colaboración si la novedad está vinculada a un reporte
    if (novedad.reporte_id) {
      await registrarColaboracion(novedad.reporte_id, usuario.id);
    }

    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'EDITAR',
      tabla_afectada: 'novedad',
      registro_id: novedad.id,
      detalles: {
        tipo: novedad.tipo,
        direccion: novedad.direccion,
        estado: novedad.estado,
      },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    const novedadActualizada = await Novedad.findByPk(novedad.id, {
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'correo', 'rol'] },
        { model: NovedadFoto, as: 'fotos' }
      ]
    });

    logger.info(`[NOVEDADES] Novedad ID: ${id} actualizada exitosamente`, {
      novedadId: id,
      estado: novedad.estado,
      tipo: novedad.tipo,
      direccion: novedad.direccion
    });

    return res.json({
      ok: true,
      mensaje: 'Novedad actualizada exitosamente',
      novedad: novedadActualizada,
    });
  } catch (error) {
    logger.error(`Error al actualizar novedad: ${error.message}`, { stack: error.stack, novedadId: req.params.id, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar novedad', error: error.message });
  }
};

exports.eliminarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    logger.info(`[NOVEDADES] Solicitud para eliminar novedad ID: ${id} recibida en la API`, {
      novedadId: id,
      usuario: usuario ? { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo } : null
    });

    const novedad = await Novedad.findByPk(id);
    if (!novedad) {
      logger.warn(`[NOVEDADES] Intento de eliminar novedad inexistente (ID: ${id})`);
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada' });
    }

    await novedad.destroy();

    await Auditoria.create({
      usuario_id: usuario.id,
      accion: 'ELIMINAR',
      tabla_afectada: 'novedad',
      registro_id: id,
      detalles: { direccion: novedad.direccion, tipo: novedad.tipo },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    logger.info(`[NOVEDADES] Novedad ID: ${id} eliminada exitosamente (soft delete)`, { novedadId: id });

    return res.json({
      ok: true,
      mensaje: 'Novedad eliminada exitosamente (soft delete)',
      id: Number(id),
    });
  } catch (error) {
    logger.error(`Error al eliminar novedad: ${error.message}`, { stack: error.stack, novedadId: req.params.id });
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar novedad', error: error.message });
  }
};

/**
 * Obtener métricas y KPIs de tiempos de respuesta globales o por filtros
 */
exports.obtenerMetricasTiempos = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, tipo, aga, reporte_id } = req.query;

    logger.info('[NOVEDADES] Solicitud de métricas de tiempos recibida', {
      filtros: { fechaDesde, fechaHasta, tipo, aga, reporte_id },
      usuario: req.usuario ? { id: req.usuario.id, correo: req.usuario.correo } : null
    });

    const where = {};

    if (tipo) where.tipo = tipo;
    if (aga) where.aga = aga;
    if (reporte_id) where.reporte_id = reporte_id;

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha[Op.gte] = new Date(fechaDesde);
      if (fechaHasta) where.fecha[Op.lte] = new Date(fechaHasta);
    }

    const { generarMetricasTiempos } = require('../services/calculosOperativosService');
    const novedades = await Novedad.findAll({
      where,
      attributes: ['id', 'tipo', 'aga', 'fecha', 'hora_sitio', 'tiempo_respuesta', 'solucionado', 'tiempo_atencion', 'datos_adicionales'],
    });

    const metricas = generarMetricasTiempos(novedades);

    logger.info(`[NOVEDADES] Métricas de tiempos generadas exitosamente para ${novedades.length} novedades`);

    return res.json({
      ok: true,
      total_analizados: novedades.length,
      metricas,
    });
  } catch (error) {
    logger.error(`Error al obtener métricas de tiempos: ${error.message}`, { stack: error.stack, query: req.query });
    return res.status(500).json({ ok: false, mensaje: 'Error al calcular métricas de tiempos', error: error.message });
  }
};
