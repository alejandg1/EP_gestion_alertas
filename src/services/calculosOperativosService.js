/**
 * Servicio de Cálculos Operativos y Tiempos de Respuesta
 * Sistema de Gestión de Alertas y Novedades - Sala Situacional Segura EP
 */

// Multiplicadores oficiales de personal por cada unidad/cuadrilla despachada
const FACTORES_PERSONAL = {
  bcbg: 2,       // Bomberos: 2 por unidad
  atm: 2,        // Tránsito: 2 por unidad
  ia: 3,         // Interagua: 3 por cuadrilla
  interagua: 3,  // Alias Interagua: 3 por cuadrilla
  parques_ep: 5, // Parques EP / DAPAV: 5 por cuadrilla
  ooppmm: 3,     // Obras Públicas Municipales: 3 por cuadrilla
  cnel: 3,       // CNEL: 3 por unidad
  urvaseo: 3,    // Urvaseo: 3 por cuadrilla
  ggrr: 4,       // Gestión de Riesgos: 4 por cuadrilla
};

/**
 * Calcula los totales de recursos y personal (respetando entrada manual si existe, o usando factores por defecto)
 * @param {Object} recursosInput - Objeto con las unidades despachadas por cada entidad
 * @param {Object} personalInput - Objeto con el personal ingresado manualmente (#_ia, #_bcbg, etc.)
 * @returns {Object} Desglose completo de recursos, personal y totales
 */
function calcularRecursosYPersonal(recursosInput = {}, personalInput = {}) {
  const recursos = {};
  const personal = {};
  let totalRecursos = 0;
  let totalPersonal = 0;
  const institucionesIntervinientes = [];

  const entradasRecursos = { ...(recursosInput || {}) };
  const entradasPersonal = { ...(personalInput || {}) };

  // 1. Unificar alias de Interagua de forma segura (tomar el valor > 0 de cualquiera de las dos claves)
  const valRecInteragua = Math.max(
    parseInt(entradasRecursos.interagua, 10) || 0,
    parseInt(entradasRecursos.ia, 10) || 0
  );
  entradasRecursos.ia = valRecInteragua;
  entradasRecursos.interagua = valRecInteragua;

  const valPersInteragua = Math.max(
    parseInt(entradasPersonal['#_interagua'], 10) || 0,
    parseInt(entradasPersonal['#_ia'], 10) || 0,
    parseInt(entradasPersonal['interagua'], 10) || 0,
    parseInt(entradasPersonal['ia'], 10) || 0
  );
  if (valPersInteragua > 0 || entradasPersonal['#_interagua'] !== undefined || entradasPersonal['#_ia'] !== undefined) {
    entradasPersonal['#_ia'] = valPersInteragua;
    entradasPersonal['#_interagua'] = valPersInteragua;
  }

  const clavesPrincipales = ['bcbg', 'atm', 'ia', 'parques_ep', 'ooppmm', 'cnel', 'urvaseo', 'ggrr'];

  for (const key of clavesPrincipales) {
    const factor = FACTORES_PERSONAL[key] || 2;
    let cantRecursos = Math.max(0, parseInt(entradasRecursos[key], 10) || 0);
    
    if (key === 'ia') {
      cantRecursos = valRecInteragua;
    }

    recursos[key] = cantRecursos;
    if (key === 'ia') {
      recursos['interagua'] = cantRecursos;
    }
    totalRecursos += cantRecursos;

    // Calcular o respetar personal manual
    let cantPersonal = 0;
    const personalManual = entradasPersonal[`#_${key}`] !== undefined
      ? parseInt(entradasPersonal[`#_${key}`], 10)
      : (entradasPersonal[key] !== undefined ? parseInt(entradasPersonal[key], 10) : null);

    if (personalManual !== null && !isNaN(personalManual) && personalManual > 0) {
      cantPersonal = personalManual;
    } else if (key === 'ia' && valPersInteragua > 0) {
      cantPersonal = valPersInteragua;
    } else {
      cantPersonal = cantRecursos * factor;
    }

    personal[`#_${key}`] = cantPersonal;
    if (key === 'ia') {
      personal['#_interagua'] = cantPersonal;
    }
    totalPersonal += cantPersonal;

    if (cantRecursos > 0 || cantPersonal > 0) {
      const nombreLabel = key === 'ia' ? 'INTERAGUA' : key.toUpperCase().replace('_', ' ');
      institucionesIntervinientes.push(nombreLabel);
    }
  }

  // Preservar cualquier otra clave personalizada
  for (const [k, v] of Object.entries(entradasRecursos)) {
    if (recursos[k] === undefined && v !== undefined) {
      const num = parseInt(v, 10);
      if (!isNaN(num) && num > 0) {
        recursos[k] = num;
        totalRecursos += num;
      }
    }
  }

  return {
    recursos,
    personal,
    total_recursos: totalRecursos,
    total_personal: totalPersonal,
    instituciones_intervinientes: institucionesIntervinientes,
  };
}

/**
 * Obtiene el timestamp ISO actual o dado
 */
function obtenerTimestampISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Obtiene la hora en formato HH:mm a partir de un Date o string ISO
 */
function obtenerHoraActualHHMM(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '00:00';
  const horas = String(d.getHours()).padStart(2, '0');
  const minutos = String(d.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

/**
 * Formatea minutos a una cadena legible en días, horas y minutos (ej: "2d 3h 15m", "45m")
 */
function formatearMinutosADuracion(minutos) {
  if (minutos === null || minutos === undefined || isNaN(minutos)) return null;
  const mins = Math.max(0, Math.round(minutos));
  if (mins < 60) return `${mins}m`;
  const dias = Math.floor(mins / 1440);
  const horasRestantes = Math.floor((mins % 1440) / 60);
  const minsRestantes = mins % 60;
  if (dias > 0) {
    return `${dias}d ${horasRestantes}h ${minsRestantes}m`;
  }
  return `${horasRestantes}h ${minsRestantes}m`;
}

/**
 * Convierte cualquier entrada de tiempo (Timestamp ISO, Unix timestamp, Date o HH:mm) en un objeto Date coherente
 * @param {Date|string} fechaBase - Fecha de referencia (ej: fecha de la solicitud/evento)
 * @param {Date|string|number} horaStr - Valor de tiempo (ISO, Date, timestamp numérico o HH:mm)
 */
function parsearHora(fechaBase, horaStr) {
  if (!horaStr && horaStr !== 0) return null;
  if (horaStr instanceof Date && !isNaN(horaStr.getTime())) return horaStr;

  const str = String(horaStr).trim();
  if (!str) return null;

  // 1. Si es un número timestamp en ms o segundos (ej: 1725289200000)
  if (/^\d{10,13}$/.test(str)) {
    const d = new Date(Number(str) * (str.length === 10 ? 1000 : 1));
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. Si es una fecha completa en formato ISO (ej: 2026-09-03T14:30:00Z) o YYYY-MM-DD HH:mm(:ss)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str)) {
    const d = new Date(str.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }

  const base = fechaBase ? new Date(fechaBase) : new Date();
  if (isNaN(base.getTime())) return null;

  // 3. Si es solo formato HH:mm o HH:mm:ss
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const d = new Date(base);
    d.setHours(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3] || 0, 10), 0);
    // Si la hora resultante es anterior a la fecha base (ej: solicitud 23:55 y llegada 00:15), cruce de medianoche (+1 día)
    if (d.getTime() < base.getTime()) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calcula automáticamente tiempo_respuesta (sitio - solicitud) y tiempo_atencion (solucionado - sitio)
 * Soporta diferencias de minutos, horas y múltiples días con precisión de timestamp
 */
function calcularTiemposNovedad({ fecha, hora_sitio, solucionado }) {
  const fechaSolicitud = parsearHora(null, fecha);
  const fechaSitio = parsearHora(fechaSolicitud, hora_sitio);
  const fechaSolucion = parsearHora(fechaSitio || fechaSolicitud, solucionado);

  let tiempo_respuesta = null;
  let tiempo_atencion = null;

  if (fechaSolicitud && fechaSitio && !isNaN(fechaSolicitud.getTime()) && !isNaN(fechaSitio.getTime())) {
    const diffMs = fechaSitio.getTime() - fechaSolicitud.getTime();
    if (diffMs >= 0) {
      tiempo_respuesta = Math.round(diffMs / (1000 * 60));
    }
  }

  if (fechaSitio && fechaSolucion && !isNaN(fechaSitio.getTime()) && !isNaN(fechaSolucion.getTime())) {
    const diffMs = fechaSolucion.getTime() - fechaSitio.getTime();
    if (diffMs >= 0) {
      tiempo_atencion = Math.round(diffMs / (1000 * 60));
    }
  }

  return { tiempo_respuesta, tiempo_atencion };
}

/**
 * Calcula métricas agregadas (KPIs de respuesta y recursos) para una lista de novedades
 */
function generarMetricasTiempos(novedades = []) {
  let totalNovedades = novedades.length;
  let conTiempoRespuesta = 0;
  let sumaTiempoRespuesta = 0;
  let conTiempoAtencion = 0;
  let sumaTiempoAtencion = 0;
  let respuestaMenor15m = 0;

  const porInstitucion = {};
  const porAga = {};
  const porTipo = {};

  let totalRecursosGlobal = 0;
  let totalPersonalGlobal = 0;

  novedades.forEach((nov) => {
    // Tiempos
    const tResp = nov.tiempo_respuesta;
    const tAtenc = nov.tiempo_atencion;

    if (tResp !== null && tResp !== undefined && !isNaN(tResp)) {
      conTiempoRespuesta++;
      sumaTiempoRespuesta += tResp;
      if (tResp <= 15) {
        respuestaMenor15m++;
      }
    }

    if (tAtenc !== null && tAtenc !== undefined && !isNaN(tAtenc)) {
      conTiempoAtencion++;
      sumaTiempoAtencion += tAtenc;
    }

    // AGA
    const aga = nov.aga || 'SIN_AGA';
    if (!porAga[aga]) porAga[aga] = { total: 0, sumaTiempo: 0, conTiempo: 0 };
    porAga[aga].total++;
    if (tResp !== null && !isNaN(tResp)) {
      porAga[aga].sumaTiempo += tResp;
      porAga[aga].conTiempo++;
    }

    // Tipo
    const tipo = nov.tipo || 'OTRO';
    if (!porTipo[tipo]) porTipo[tipo] = { total: 0, sumaTiempo: 0, conTiempo: 0 };
    porTipo[tipo].total++;
    if (tResp !== null && !isNaN(tResp)) {
      porTipo[tipo].sumaTiempo += tResp;
      porTipo[tipo].conTiempo++;
    }

    // Desglose de recursos y personal en datos_adicionales
    const extras = nov.datos_adicionales || {};
    if (extras.total_recursos) totalRecursosGlobal += (parseInt(extras.total_recursos, 10) || 0);
    if (extras.total_personal) totalPersonalGlobal += (parseInt(extras.total_personal, 10) || 0);

    const recursosObj = extras.recursos || {};
    for (const [instKey, cant] of Object.entries(recursosObj)) {
      const nombreInst = instKey === 'ia' ? 'INTERAGUA' : instKey.toUpperCase().replace('_', ' ');
      if (!porInstitucion[nombreInst]) {
        porInstitucion[nombreInst] = {
          intervenciones: 0,
          recursos_totales: 0,
          personal_total: 0,
          sumaTiempo: 0,
          conTiempo: 0
        };
      }
      if (cant > 0) {
        porInstitucion[nombreInst].intervenciones++;
        porInstitucion[nombreInst].recursos_totales += cant;
        porInstitucion[nombreInst].personal_total += (cant * (FACTORES_PERSONAL[instKey] || 2));
        if (tResp !== null && !isNaN(tResp)) {
          porInstitucion[nombreInst].sumaTiempo += tResp;
          porInstitucion[nombreInst].conTiempo++;
        }
      }
    }
  });

  const promedioRespuestaGlobal = conTiempoRespuesta > 0
    ? Number((sumaTiempoRespuesta / conTiempoRespuesta).toFixed(1))
    : null;

  const promedioAtencionGlobal = conTiempoAtencion > 0
    ? Number((sumaTiempoAtencion / conTiempoAtencion).toFixed(1))
    : null;

  const porcentajeSla15m = conTiempoRespuesta > 0
    ? `${((respuestaMenor15m / conTiempoRespuesta) * 100).toFixed(1)}%`
    : '0.0%';

  const metricasInstituciones = Object.keys(porInstitucion).map(inst => ({
    institucion: inst,
    intervenciones: porInstitucion[inst].intervenciones,
    recursos_desplegados: porInstitucion[inst].recursos_totales,
    personal_estimado: porInstitucion[inst].personal_total,
    tiempo_respuesta_promedio_min: porInstitucion[inst].conTiempo > 0
      ? Number((porInstitucion[inst].sumaTiempo / porInstitucion[inst].conTiempo).toFixed(1))
      : null,
  }));

  const metricasAga = Object.keys(porAga).map(aga => ({
    aga,
    total_eventos: porAga[aga].total,
    tiempo_respuesta_promedio_min: porAga[aga].conTiempo > 0
      ? Number((porAga[aga].sumaTiempo / porAga[aga].conTiempo).toFixed(1))
      : null,
  }));

  const metricasTipo = Object.keys(porTipo).map(tipo => ({
    tipo,
    total_eventos: porTipo[tipo].total,
    tiempo_respuesta_promedio_min: porTipo[tipo].conTiempo > 0
      ? Number((porTipo[tipo].sumaTiempo / porTipo[tipo].conTiempo).toFixed(1))
      : null,
  }));

  return {
    total_novedades: totalNovedades,
    novedades_con_tiempo_respuesta: conTiempoRespuesta,
    tiempo_respuesta_promedio_minutos: promedioRespuestaGlobal,
    tiempo_atencion_promedio_minutos: promedioAtencionGlobal,
    cumplimiento_sla_menor_15m: porcentajeSla15m,
    total_recursos_desplegados: totalRecursosGlobal,
    total_personal_estimado: totalPersonalGlobal,
    por_institucion: metricasInstituciones,
    por_aga: metricasAga,
    por_tipo: metricasTipo,
  };
}

module.exports = {
  FACTORES_PERSONAL,
  obtenerTimestampISO,
  obtenerHoraActualHHMM,
  formatearMinutosADuracion,
  parsearHora,
  calcularRecursosYPersonal,
  calcularTiemposNovedad,
  generarMetricasTiempos,
};
