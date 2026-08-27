const mongoose = require('mongoose');
const Reporte = require('../models/Reporte');
const Usuario = require('../models/Usuario');
const Auditoria = require('../models/Auditoria');
const { sharepointService, COLUMNAS_EXCEL } = require('../services/sharepointService');

const generarCodigoReporte = async () => {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await Reporte.countDocuments();
  const correlativo = String(count + 1).padStart(3, '0');
  return `REP-${yearMonth}-${correlativo}`;
};

exports.listarReportes = async (req, res) => {
  try {
    const { page, limit, busqueda, estado, fechaDesde, fechaHasta } = req.query;

    const filtro = {};

    if (busqueda && busqueda.trim()) {
      filtro.$or = [
        { numero_rds: { $regex: busqueda.trim(), $options: 'i' } },
        { titulo: { $regex: busqueda.trim(), $options: 'i' } },
        { elaborado_por: { $regex: busqueda.trim(), $options: 'i' } }
      ];
    }

    if (estado && estado.trim()) {
      filtro.estado = estado.trim().toUpperCase();
    }

    if (fechaDesde || fechaHasta) {
      filtro.fecha_reporte = {};
      if (fechaDesde) filtro.fecha_reporte.$gte = fechaDesde;
      if (fechaHasta) filtro.fecha_reporte.$lte = fechaHasta;
    }

    const selectFields = 'codigo titulo estado numero_rds fecha_reporte hora_inicio hora_fin revisado_por cabecera periodo inocar_fecha inocar_pleamar inocar_bajamar elaborado_por colaboradores novedades creado_en actualizado_en';

    if (!page && !limit) {
      const reportes = await Reporte.find(filtro)
        .sort({ actualizado_en: -1 })
        .select(selectFields);

      return res.json({
        ok: true,
        total: reportes.length,
        reportes
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

    const [reportes, total] = await Promise.all([
      Reporte.find(filtro)
        .sort({ actualizado_en: -1 })
        .skip(skip)
        .limit(limitNum)
        .select(selectFields),
      Reporte.countDocuments(filtro)
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return res.json({
      ok: true,
      total,
      reportes,
      data: reportes,
      paginacion: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    logger.error(`Error al listar reportes: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al listar reportes', error: error.message });
  }
};


exports.crearReporte = async (req, res) => {
  try {
    const {
      titulo,
      observaciones_generales,
      numero_rds,
      fecha_reporte,
      hora_inicio,
      hora_fin,
      revisado_por,
      cabecera,
      periodo,
      inocar_fecha,
      inocar_pleamar,
      inocar_bajamar,
      usuario_id,
      colaborador_id,
      correo_colaborador,
      colaborador_correo,
      colaboradores: colaboradoresEntrantes,
    } = req.body;
    const usuarioAuth = req.usuario;

    const listaColaboradores = [];
    const idsAgregados = new Set();

    // 1. Agregar al usuario creador autenticado
    if (usuarioAuth) {
      listaColaboradores.push({
        usuario_id: usuarioAuth._id,
        nombre: usuarioAuth.nombre || usuarioAuth.correo,
        correo: usuarioAuth.correo,
        primer_aporte: new Date(),
        ultimo_aporte: new Date(),
        total_ediciones: 1,
      });
      idsAgregados.add(String(usuarioAuth._id));
    }

    const targetUserId = usuario_id || colaborador_id;
    if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
      const u = await Usuario.findById(targetUserId);
      if (u && !idsAgregados.has(String(u._id))) {
        listaColaboradores.push({
          usuario_id: u._id,
          nombre: u.nombre || u.correo,
          correo: u.correo,
          primer_aporte: new Date(),
          ultimo_aporte: new Date(),
          total_ediciones: 1,
        });
        idsAgregados.add(String(u._id));
      }
    }

    const targetEmail = correo_colaborador || colaborador_correo;
    if (targetEmail) {
      const u = await Usuario.findOne({ correo: String(targetEmail).toLowerCase().trim() });
      if (u && !idsAgregados.has(String(u._id))) {
        listaColaboradores.push({
          usuario_id: u._id,
          nombre: u.nombre || u.correo,
          correo: u.correo,
          primer_aporte: new Date(),
          ultimo_aporte: new Date(),
          total_ediciones: 1,
        });
        idsAgregados.add(String(u._id));
      }
    }

    if (Array.isArray(colaboradoresEntrantes)) {
      for (const item of colaboradoresEntrantes) {
        const uid = typeof item === 'string' ? item : item?.usuario_id || item?._id;
        const uEmail = typeof item === 'object' ? item?.correo : null;

        let u = null;
        if (uid && mongoose.Types.ObjectId.isValid(uid)) {
          u = await Usuario.findById(uid);
        } else if (uEmail) {
          u = await Usuario.findOne({ correo: String(uEmail).toLowerCase().trim() });
        }

        if (u && !idsAgregados.has(String(u._id))) {
          listaColaboradores.push({
            usuario_id: u._id,
            nombre: u.nombre || u.correo,
            correo: u.correo,
            primer_aporte: new Date(),
            ultimo_aporte: new Date(),
            total_ediciones: 1,
          });
          idsAgregados.add(String(u._id));
        }
      }
    }

    const codigo = await generarCodigoReporte();

    const nuevoReporte = new Reporte({
      codigo,
      titulo: titulo || '',
      observaciones_generales: observaciones_generales || '',
      numero_rds: numero_rds || '',
      fecha_reporte: fecha_reporte || new Date().toISOString().split('T')[0],
      hora_inicio: hora_inicio || '',
      hora_fin: hora_fin || '',
      revisado_por: revisado_por || '',
      cabecera: cabecera || '',
      periodo: periodo || '',
      inocar_fecha: inocar_fecha || '',
      inocar_pleamar: inocar_pleamar || '',
      inocar_bajamar: inocar_bajamar || '',
      colaboradores: listaColaboradores,
      novedades: []
    });

    await nuevoReporte.save();

    await Auditoria.create({
      usuario_id: usuarioAuth._id,
      usuario_correo: usuarioAuth.correo,
      reporte_id: nuevoReporte._id,
      entidad: 'REPORTE',
      accion: 'CREAR',
      detalles: { codigo: nuevoReporte.codigo, titulo: nuevoReporte.titulo, numero_rds: nuevoReporte.numero_rds },
    });

    return res.status(201).json({ ok: true, mensaje: 'Reporte creado exitosamente', reporte: nuevoReporte });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al crear reporte', error: error.message });
  }
};

exports.actualizarParametros = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const camposPermitidos = [
      'titulo', 'observaciones_generales', 'numero_rds', 'fecha_reporte',
      'hora_inicio', 'hora_fin', 'revisado_por', 'cabecera', 'periodo',
      'inocar_fecha', 'inocar_pleamar', 'inocar_bajamar', 'estado'
    ];

    const reporte = await Reporte.findById(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        reporte[campo] = req.body[campo];
      }
    });

    if (usuario) {
      const colabIndex = reporte.colaboradores.findIndex(
        c => String(c.usuario_id) === String(usuario._id)
      );

      if (colabIndex >= 0) {
        reporte.colaboradores[colabIndex].ultimo_aporte = new Date();
        reporte.colaboradores[colabIndex].total_ediciones = (reporte.colaboradores[colabIndex].total_ediciones || 1) + 1;
      } else {
        reporte.colaboradores.push({
          usuario_id: usuario._id,
          nombre: usuario.nombre || usuario.correo,
          correo: usuario.correo,
          primer_aporte: new Date(),
          ultimo_aporte: new Date(),
          total_ediciones: 1,
        });
      }
    }

    await reporte.save();

    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
      reporte_id: reporte._id,
      entidad: 'REPORTE',
      accion: 'EDITAR',
      detalles: { accion: 'ACTUALIZAR_PARAMETROS', camposModificados: Object.keys(req.body) },
    });

    return res.json({ ok: true, mensaje: 'Parámetros del reporte actualizados exitosamente', reporte });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar parámetros', error: error.message });
  }
};

exports.obtenerReporte = async (req, res) => {
  try {
    const { id } = req.params;
    const reporte = await Reporte.findById(id);

    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    return res.json({ ok: true, reporte });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener reporte', error: error.message });
  }
};

exports.subirFotos = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, mensaje: 'No se enviaron archivos de imagen para subir' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const rutasFotos = req.files.map((file) => `/uploads/fotos/${file.filename}`);
    const urlsCompletas = req.files.map((file) => `${protocol}://${host}/uploads/fotos/${file.filename}`);

    return res.status(201).json({
      ok: true,
      mensaje: `${req.files.length} fotografía(s) guardada(s) exitosamente en el servidor`,
      fotos: rutasFotos,
      urls: urlsCompletas,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al procesar la subida de fotografías', error: error.message });
  }
};

exports.agregarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const datosNovedad = req.body;

    const reporte = await Reporte.findById(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    let fotosArray = [];
    if (req.files && req.files.length > 0) {
      fotosArray = req.files.map(f => `/uploads/fotos/${f.filename}`);
    } else if (Array.isArray(datosNovedad.fotos)) {
      fotosArray = datosNovedad.fotos;
    } else if (typeof datosNovedad.fotos === 'string' && datosNovedad.fotos.trim()) {
      try {
        fotosArray = JSON.parse(datosNovedad.fotos);
      } catch {
        fotosArray = [datosNovedad.fotos];
      }
    }

    const nuevaNovedad = {
      usuario_id: usuario._id,
      usuario_nombre: usuario.nombre || usuario.correo,
      tipo_evento: datosNovedad.tipo_evento || 'AGUA',
      direccion: datosNovedad.direccion || 'Sin direccion',
      aga: datosNovedad.aga || 'A09',
      instituciones: datosNovedad.instituciones || '@emapagye @interagua',
      fecha_evento: datosNovedad.fecha_evento || new Date().toISOString().split('T')[0],
      hora_evento: datosNovedad.hora_evento || '12:00',
      latitud: datosNovedad.latitud !== undefined ? Number(datosNovedad.latitud) : -2.1894,
      longitud: datosNovedad.longitud !== undefined ? Number(datosNovedad.longitud) : -79.8891,
      recurso_asignado: datosNovedad.recurso_asignado || 'INS-ALC 🚙',
      estado_operativo: datosNovedad.estado_operativo || '⛔PENDIENTE',
      descripcion: datosNovedad.descripcion || '',
      acciones_inmediatas: datosNovedad.acciones_inmediatas || '',
      fotos: fotosArray,
      ficha: datosNovedad.ficha || '',
      camara_cvvc: datosNovedad.camara_cvvc || '',
      desaparecidos: datosNovedad.desaparecidos || 0,
      fallecidos: datosNovedad.fallecidos || 0,
      via_afectada: datosNovedad.via_afectada || 'NO',
      propiedad_publica: datosNovedad.propiedad_publica || 'NO',
      propiedad_privada: datosNovedad.propiedad_privada || 'NO',
      bcbg: datosNovedad.bcbg || '',
      atm: datosNovedad.atm || '',
      ia: datosNovedad.ia || '',
      parques_ep: datosNovedad.parques_ep || '',
      ooppmm: datosNovedad.ooppmm || '',
      cnel: datosNovedad.cnel || '',
      urvaseo: datosNovedad.urvaseo || '',
      ggrr: datosNovedad.ggrr || '',
      total_recursos: datosNovedad.total_recursos || 0,
      num_bcbg: datosNovedad.num_bcbg || 0,
      num_atm: datosNovedad.num_atm || 0,
      num_ia: datosNovedad.num_ia || 0,
      num_parques_ep: datosNovedad.num_parques_ep || 0,
      num_ooppmm: datosNovedad.num_ooppmm || 0,
      num_cnel: datosNovedad.num_cnel || 0,
      num_urvaseo: datosNovedad.num_urvaseo || 0,
      num_ggrr: datosNovedad.num_ggrr || 0,
      total_personal: datosNovedad.total_personal || 0,
      recursos: datosNovedad.recursos || '',
      hora_en_sitio: datosNovedad.hora_en_sitio || '',
      tiempo_respuesta: datosNovedad.tiempo_respuesta || '',
      solucionado: datosNovedad.solucionado || 'EN PROCESO'
    };

    reporte.novedades.push(nuevaNovedad);

    const colabIndex = reporte.colaboradores.findIndex(c => c.usuario_id.toString() === usuario._id.toString());
    if (colabIndex >= 0) {
      reporte.colaboradores[colabIndex].ultimo_aporte = new Date();
      reporte.colaboradores[colabIndex].total_ediciones += 1;
    } else {
      reporte.colaboradores.push({
        usuario_id: usuario._id,
        nombre: usuario.nombre || usuario.correo,
        correo: usuario.correo,
        primer_aporte: new Date(),
        ultimo_aporte: new Date(),
        total_ediciones: 1,
      });
    }

    await reporte.save();

    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
      reporte_id: reporte._id,
      entidad: 'NOVEDAD',
      accion: 'CREAR',
      detalles: { novedad_direccion: nuevaNovedad.direccion, tipo: nuevaNovedad.tipo_evento, usuario: nuevaNovedad.usuario_nombre, fotos_count: fotosArray.length },
    });

    return res.status(201).json({ ok: true, mensaje: 'Novedad agregada exitosamente', reporte });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al agregar novedad', error: error.message });
  }
};

exports.actualizarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const usuario = req.usuario;
    const datos = req.body || {};

    const reporte = await Reporte.findById(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    const novedad = reporte.novedades.id(novedadId);
    if (!novedad) {
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada en el reporte' });
    }

    const camposPermitidos = [
      'tipo_evento', 'direccion', 'aga', 'instituciones', 'fecha_evento',
      'hora_evento', 'latitud', 'longitud', 'recurso_asignado', 'estado_operativo',
      'descripcion', 'acciones_inmediatas', 'ficha', 'camara_cvvc',
      'desaparecidos', 'fallecidos', 'via_afectada', 'propiedad_publica',
      'propiedad_privada', 'bcbg', 'atm', 'ia', 'parques_ep', 'ooppmm',
      'cnel', 'urvaseo', 'ggrr', 'total_recursos', 'num_bcbg', 'num_atm',
      'num_ia', 'num_parques_ep', 'num_ooppmm', 'num_cnel', 'num_urvaseo',
      'num_ggrr', 'total_personal', 'recursos', 'hora_en_sitio',
      'tiempo_respuesta', 'solucionado', 'estado_novedad'
    ];

    camposPermitidos.forEach(campo => {
      if (datos[campo] !== undefined) {
        if (['latitud', 'longitud', 'desaparecidos', 'fallecidos', 'total_recursos', 'num_bcbg', 'num_atm', 'num_ia', 'num_parques_ep', 'num_ooppmm', 'num_cnel', 'num_urvaseo', 'num_ggrr', 'total_personal'].includes(campo)) {
          novedad[campo] = Number(datos[campo]);
        } else {
          novedad[campo] = datos[campo];
        }
      }
    });

    if (req.files && req.files.length > 0) {
      const nuevasFotos = req.files.map(f => `/uploads/fotos/${f.filename}`);
      novedad.fotos = novedad.fotos ? novedad.fotos.concat(nuevasFotos) : nuevasFotos;
    } else if (datos.fotos !== undefined) {
      if (Array.isArray(datos.fotos)) {
        novedad.fotos = datos.fotos;
      } else if (typeof datos.fotos === 'string' && datos.fotos.trim()) {
        try {
          novedad.fotos = JSON.parse(datos.fotos);
        } catch {
          novedad.fotos = [datos.fotos];
        }
      }
    }

    if (usuario) {
      const colabIndex = reporte.colaboradores.findIndex(
        c => String(c.usuario_id) === String(usuario._id)
      );

      if (colabIndex >= 0) {
        reporte.colaboradores[colabIndex].ultimo_aporte = new Date();
        reporte.colaboradores[colabIndex].total_ediciones = (reporte.colaboradores[colabIndex].total_ediciones || 1) + 1;
      } else {
        reporte.colaboradores.push({
          usuario_id: usuario._id,
          nombre: usuario.nombre || usuario.correo,
          correo: usuario.correo,
          primer_aporte: new Date(),
          ultimo_aporte: new Date(),
          total_ediciones: 1,
        });
      }
    }

    await reporte.save();

    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
      reporte_id: reporte._id,
      entidad: 'NOVEDAD',
      accion: 'EDITAR',
      detalles: { novedad_id: novedad._id, direccion: novedad.direccion, camposModificados: Object.keys(datos) },
    });

    return res.json({
      ok: true,
      mensaje: 'Novedad actualizada exitosamente',
      novedad,
      elaborado_por: reporte.elaborado_por,
      colaboradores: reporte.colaboradores
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar novedad', error: error.message });
  }
};

exports.eliminarNovedad = async (req, res) => {
  try {
    const { id, novedadId } = req.params;
    const usuario = req.usuario;

    const reporte = await Reporte.findById(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    const novedad = reporte.novedades.id(novedadId);
    if (!novedad) {
      return res.status(404).json({ ok: false, mensaje: 'Novedad no encontrada en el reporte' });
    }

    const direccionEliminada = novedad.direccion;
    reporte.novedades.pull(novedadId);

    if (usuario) {
      const colabIndex = reporte.colaboradores.findIndex(
        c => String(c.usuario_id) === String(usuario._id)
      );
      if (colabIndex >= 0) {
        reporte.colaboradores[colabIndex].ultimo_aporte = new Date();
        reporte.colaboradores[colabIndex].total_ediciones = (reporte.colaboradores[colabIndex].total_ediciones || 1) + 1;
      }
    }

    await reporte.save();

    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
      reporte_id: reporte._id,
      entidad: 'NOVEDAD',
      accion: 'ELIMINAR',
      detalles: { novedad_id: novedadId, direccion: direccionEliminada },
    });

    return res.json({
      ok: true,
      mensaje: 'Novedad eliminada exitosamente',
      novedad_id: novedadId,
      elaborado_por: reporte.elaborado_por,
      colaboradores: reporte.colaboradores,
      total_novedades: reporte.novedades.length
    });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al eliminar novedad', error: error.message });
  }
};

exports.exportarAExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const reporte = await Reporte.findById(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    if (!reporte.novedades || reporte.novedades.length === 0) {
      return res.status(400).json({ ok: false, mensaje: 'El reporte no tiene novedades para registrar en Excel' });
    }

    const resultado = await sharepointService.registrarReporteEnExcel(reporte);

    reporte.estado = 'EXPORTADO_EXCEL';
    await reporte.save();

    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
      reporte_id: reporte._id,
      entidad: 'REPORTE',
      accion: 'EDITAR',
      detalles: { accion: 'EXPORTADO_A_EXCEL_SHAREPOINT', total_filas: reporte.novedades.length }
    });

    return res.json({
      ok: true,
      mensaje: 'Reporte sincronizado con Excel',
      resultado
    });
  } catch (error) {
    console.error('Error al sincronizar con SharePoint:', error);
    return res.status(500).json({ ok: false, mensaje: 'Error al sincronizar con SharePoint Excel', error: error.message });
  }
};
