const Reporte = require('../models/Reporte');
const Auditoria = require('../models/Auditoria');
const { sharepointService, COLUMNAS_EXCEL } = require('../services/sharepointService');

// Generar codigo correlativo de reporte (Ej: REP-202608-001)
const generarCodigoReporte = async () => {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await Reporte.countDocuments();
  const correlativo = String(count + 1).padStart(3, '0');
  return `REP-${yearMonth}-${correlativo}`;
};

// Listar reportes con paginacion y colaboradores
exports.listarReportes = async (req, res) => {
  try {
    const reportes = await Reporte.find()
      .sort({ actualizado_en: -1 })
      .select('codigo titulo estado numero_rds fecha_reporte hora_inicio hora_fin revisado_por cabecera periodo inocar_fecha inocar_pleamar inocar_bajamar elaborado_por colaboradores novedades creado_en actualizado_en');
    
    return res.json({ ok: true, total: reportes.length, reportes });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al listar reportes', error: error.message });
  }
};

// Crear nuevo reporte contenedor con parámetros institucionales
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
    } = req.body;
    const usuario = req.usuario;

    const codigo = await generarCodigoReporte();

    const nuevoReporte = new Reporte({
      codigo,
      titulo: titulo || `Reporte de Alertas e Incidentes - ${new Date().toLocaleDateString()}`,
      observaciones_generales: observaciones_generales || '',
      numero_rds: numero_rds || 'SEGURA-EP-GASGEC-SS-2026-041 (Lluvias)',
      fecha_reporte: fecha_reporte || new Date().toISOString().split('T')[0],
      hora_inicio: hora_inicio || '06:00',
      hora_fin: hora_fin || '22:00',
      revisado_por: revisado_por || 'Jefe de Sala Situacional | MSc. Ing. Santiago Jaramillo',
      cabecera: cabecera || 'REPORTE DE NOVEDADES POR LLUVIAS INICIAL: 07/05/2026 21h30',
      periodo: periodo || 'Durante la noche del 7 de mayo se han registrado las siguientes novedades en el cantón Guayaquil por efecto de las lluvias:',
      inocar_fecha: inocar_fecha || '7 de mayo',
      inocar_pleamar: inocar_pleamar || 'a las 22h42 con 4.13m',
      inocar_bajamar: inocar_bajamar || 'a las 05h27 del 08/05/2026 con 0.79m',
      colaboradores: [],
      elaborado_por: '',
      novedades: []
    });

    await nuevoReporte.save();

    // Auditoria
    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
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

// Actualizar parámetros institucionales de un reporte existente
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

    await reporte.save();

    // Auditoria
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

// Obtener reporte por ID con novedades y colaboradores
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

// Subida de fotografías al sistema de archivos local del servidor
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

// Agregar Novedad a un Reporte (1:N) vinculada directamente al Usuario
exports.agregarNovedad = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const datosNovedad = req.body;

    const reporte = await Reporte.findById(id);
    if (!reporte) {
      return res.status(404).json({ ok: false, mensaje: 'Reporte no encontrado' });
    }

    // Extraer fotos si vinieron en multipart (req.files) o como array de rutas en JSON (req.body.fotos)
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
      // Campos especificos del formato Excel
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

    // Actualizar relacion N:N de colaboradores
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

    // Auditoria
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

// Exportar/Sincronizar Novedades del Reporte al Excel de SharePoint
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

    // Actualizar estado del reporte
    reporte.estado = 'EXPORTADO_EXCEL';
    await reporte.save();

    // Auditoria
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
