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

      return res.json({
        ok: true,
        total: count,
        pagina: pageNum,
        totalPaginas: Math.ceil(count / limitNum),
        novedades: rows,
      });
    }

    const novedades = await Novedad.findAll(options);
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
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada' });
    }

    return res.json({ ok: true, novedad });
  } catch (error) {
    logger.error(`Error al obtener novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener novedad', error: error.message });
  }
};

exports.crearNovedad = async (req, res) => {
  try {
    const usuario = req.usuario;
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
      datos_adicionales: parsedDatosAdicionales || null,
    });

    // Guardar fotos si vienen en multipart/form-data
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

    return res.status(201).json({
      ok: true,
      mensaje: 'Novedad registrada exitosamente',
      novedad: novedadCompleta,
    });
  } catch (error) {
    logger.error(`Error al crear novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al crear novedad', error: error.message });
  }
};

exports.actualizarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const novedad = await Novedad.findByPk(id);

    if (!novedad) {
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
      datos_adicionales,
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
    if (reporte_id !== undefined) novedad.reporte_id = reporte_id;

    if (datos_adicionales !== undefined) {
      let parsed = datos_adicionales;
      if (typeof datos_adicionales === 'string') {
        try { parsed = JSON.parse(datos_adicionales); } catch { parsed = {}; }
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

exports.eliminarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const novedad = await Novedad.findByPk(id);
    if (!novedad) {
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

    return res.json({
      ok: true,
      mensaje: 'Novedad eliminada exitosamente (soft delete)',
      id: Number(id),
    });
  } catch (error) {
    logger.error(`Error al eliminar novedad: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar novedad', error: error.message });
  }
};
