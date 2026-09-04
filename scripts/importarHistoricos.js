require('dotenv').config();
const path = require('path');
const xlsx = require('xlsx');
const { sequelize } = require('../src/config/database');
const { Novedad, Usuario } = require('../src/models');

// Mapeo canónico de eventos a tipos ENUM de Novedad
// ENUM('AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION')
function mapearTipoEvento(eventoStr) {
  if (!eventoStr) return 'AGUA';
  const normalizado = String(eventoStr).toUpperCase().trim();

  if (normalizado.includes('ARBOL')) return 'ARBOL';
  if (normalizado.includes('POSTE')) return 'POSTE';
  if (normalizado.includes('DESLIZAMIENTO') || normalizado.includes('TIERRA')) return 'DESLIZAMIENTO';
  if (normalizado.includes('VENDAVAL')) return 'VENDAVAL';
  if (normalizado.includes('INUNDACION') || normalizado.includes('INUNDACIÓN')) return 'INUNDACION';
  if (normalizado.includes('ACCIDENTE') || normalizado.includes('TRANSITO') || normalizado.includes('SINIESTRO')) return 'SINIESTRO';
  if (normalizado.includes('SOCAVON') || normalizado.includes('SOCAVAMIENTO') || normalizado.includes('SUBSIDENCIA') || normalizado.includes('COLAPSO') || normalizado.includes('ENERGIA')) return 'AFECTACION';
  return 'AGUA';
}

// Convierte un número serial de Excel o string a Date
function parsearFechaExcel(fechaSerial, horaInput) {
  let anio = 2024, mes = 1, dia = 1;
  let horas = 0, minutos = 0, segundos = 0;

  // 1. Procesar Fecha
  if (typeof fechaSerial === 'number') {
    const parsed = xlsx.SSF.parse_date_code(fechaSerial);
    if (parsed) {
      anio = parsed.y;
      mes = parsed.m;
      dia = parsed.d;
      horas = parsed.H || 0;
      minutos = parsed.M || 0;
      segundos = parsed.S || 0;
    }
  } else if (fechaSerial instanceof Date && !isNaN(fechaSerial.getTime())) {
    anio = fechaSerial.getFullYear();
    mes = fechaSerial.getMonth() + 1;
    dia = fechaSerial.getDate();
  } else if (typeof fechaSerial === 'string' && fechaSerial.trim()) {
    const d = new Date(fechaSerial);
    if (!isNaN(d.getTime())) {
      anio = d.getFullYear();
      mes = d.getMonth() + 1;
      dia = d.getDate();
    }
  }

  // 2. Procesar Hora adicional si se proporciona
  if (horaInput !== undefined && horaInput !== null && horaInput !== '' && horaInput !== 'NA' && horaInput !== '---') {
    if (typeof horaInput === 'number') {
      const parsedH = xlsx.SSF.parse_date_code(horaInput);
      if (parsedH) {
        horas = parsedH.H || 0;
        minutos = parsedH.M || 0;
        segundos = parsedH.S || 0;
      }
    } else if (typeof horaInput === 'string') {
      const match = horaInput.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (match) {
        horas = parseInt(match[1], 10);
        minutos = parseInt(match[2], 10);
        segundos = parseInt(match[3] || 0, 10);
      }
    }
  }

  return new Date(Date.UTC(anio, mes - 1, dia, horas, minutos, segundos));
}

// Convierte serial de Excel o string a formato HH:mm o ISO string
function formatearHoraOFecha(val) {
  if (val === undefined || val === null || val === '' || val === 'NA' || val === '---' || val === 0) return null;
  if (typeof val === 'number') {
    const parsed = xlsx.SSF.parse_date_code(val);
    if (!parsed) return null;
    if (parsed.y > 1900) {
      // Es una fecha completa
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S)).toISOString();
    }
    // Es solo hora
    const hh = String(parsed.H || 0).padStart(2, '0');
    const mm = String(parsed.M || 0).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof val === 'string') {
    const limpio = val.trim();
    return limpio === '' || limpio === 'NA' || limpio === '---' ? null : limpio;
  }
  return null;
}

// Convierte tiempo de respuesta (serial de fracción de día de Excel o minutos) a minutos enteros
function convertirTiempoRespuestaMinutos(val) {
  if (val === undefined || val === null || val === '' || val === 'NA' || val === '---') return null;
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) return null;

  // En Excel una fracción < 1 representa fracción de día (ej: 0.08333 día = 120 min)
  if (num < 1) {
    return Math.round(num * 24 * 60);
  }
  return Math.round(num);
}

// Construye los tags de instituciones (@bcbg, @interagua, @parquesep, etc.)
function construirTagsInstituciones(recObj, instTexto) {
  const tags = new Set();
  if (recObj) {
    if (recObj.bcbg > 0) tags.add('@bcbg');
    if (recObj.ia > 0 || recObj.interagua > 0) tags.add('@interagua');
    if (recObj.parques_ep > 0) tags.add('@parquesep');
    if (recObj.atm > 0) tags.add('@atm');
    if (recObj.ooppmm > 0) tags.add('@ooppmm');
    if (recObj.cnel > 0) tags.add('@cnel');
    if (recObj.urvaseo > 0) tags.add('@urvaseo');
    if (recObj.ggrr > 0) tags.add('@ggrr');
  }
  if (instTexto && typeof instTexto === 'string' && instTexto.trim() !== '0' && instTexto.trim() !== 'NA') {
    const limpia = instTexto.toUpperCase();
    if (limpia.includes('INTERAGUA') || limpia.includes('EMAPAG')) tags.add('@interagua');
    if (limpia.includes('BOMBERO') || limpia.includes('BCBG')) tags.add('@bcbg');
    if (limpia.includes('PARQUE') || limpia.includes('DAPAV')) tags.add('@parquesep');
    if (limpia.includes('ATM') || limpia.includes('TRANSITO')) tags.add('@atm');
    if (limpia.includes('CNEL')) tags.add('@cnel');
    if (limpia.includes('URVASEO')) tags.add('@urvaseo');
  }
  return Array.from(tags).join(' ') || null;
}

// Normaliza el estado operativo
function determinarEstado(solucionadoVal, observacionVal) {
  if (solucionadoVal && solucionadoVal !== '0' && solucionadoVal !== 'NA' && solucionadoVal !== '---') {
    return 'SOLUCIONADO';
  }
  if (observacionVal && typeof observacionVal === 'string') {
    const obs = observacionVal.toUpperCase();
    if (obs.includes('ATENDIDO') || obs.includes('FINALIZ') || obs.includes('SOLUCION')) {
      return 'SOLUCIONADO';
    }
  }
  return 'PENDIENTE';
}

async function importarDatos() {
  const filePath = path.join(__dirname, '..', 'REGISTRO DE EVENTOS ADVERSOS - EPOCA LLUVIOSA1.xlsx');
  console.log(`\n======================================================`);
  console.log(` Iniciando importación desde: ${filePath}`);
  console.log(`======================================================\n`);

  try {
    await sequelize.authenticate();
    console.log(' Conectado a la base de datos PostgreSQL.');

    // 1. Obtener o verificar usuario para la autoría
    let usuario = await Usuario.findOne();
    if (!usuario) {
      console.log(' No se encontró usuario en BD. Creando usuario "Sistema Importador"...');
      usuario = await Usuario.create({
        nombre: 'Sistema Importador',
        email: 'sistema@seguraep.gob.ec',
        password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456', // dummy
        rol: 'ADMIN',
        activo: true,
      });
    }
    const usuarioId = usuario.id;
    console.log(` Registros serán asignados a usuario ID: ${usuarioId} (${usuario.nombre})`);

    const wb = xlsx.readFile(filePath);

    // ==========================================
    // 2. PROCESAR HOJA: LLUVIAS 2024 - 2026
    // ==========================================
    console.log('\n Leyendo hoja "LLUVIAS 2024 - 2026"...');
    const sheetLluvias = wb.Sheets['LLUVIAS 2024 - 2026'];
    const filasLluvias = xlsx.utils.sheet_to_json(sheetLluvias);
    console.log(` Se encontraron ${filasLluvias.length} filas en LLUVIAS.`);

    const novedadesLluvias = [];

    for (const r of filasLluvias) {
      // Ignorar filas sin datos indispensables
      if (!r['EVENTO'] && !r['DIRECCIÓN']) continue;

      const fechaEvento = parsearFechaExcel(r['FECHA'], r['HORA SOLICITUD']);
      const tipo = mapearTipoEvento(r['EVENTO']);
      const latitud = r['LATITUD'] ? parseFloat(r['LATITUD']) : null;
      const longitud = r['LONGITUD'] ? parseFloat(r['LONGITUD']) : null;

      const recursos = {
        bcbg: parseInt(r['BCBG'], 10) || 0,
        ia: parseInt(r['IA'], 10) || 0,
        interagua: parseInt(r['IA'], 10) || 0,
        parques_ep: parseInt(r['PARQUES EP'], 10) || 0,
        atm: parseInt(r['ATM'], 10) || 0,
        ooppmm: parseInt(r['OOPPMM'], 10) || 0,
        cnel: parseInt(r['CNEL'], 10) || 0,
        urvaseo: parseInt(r['URVASEO'], 10) || 0,
        ggrr: parseInt(r['GGRR'], 10) || 0,
      };

      const personal = {
        '#_bcbg': parseInt(r['#_BCBG'], 10) || 0,
        '#_ia': parseInt(r['#_IA'], 10) || 0,
        '#_interagua': parseInt(r['#_IA'], 10) || 0,
        '#_parques_ep': parseInt(r['#_PARQUES EP'], 10) || 0,
        '#_atm': parseInt(r['#_ATM'], 10) || 0,
        '#_ooppmm': parseInt(r['#_OOPPMM'], 10) || 0,
        '#_cnel': parseInt(r['#_CNEL'], 10) || 0,
        '#_urvaseo': parseInt(r['#_URVASEO'], 10) || 0,
        '#_ggrr': parseInt(r['#_GGRR'], 10) || 0,
      };

      const totalRecursos = parseInt(r['TOTAL RECURSOS'], 10) || Object.values(recursos).reduce((a, b) => a + b, 0);
      const totalPersonal = parseInt(r['TOTAL PERSONAL'], 10) || Object.values(personal).reduce((a, b) => a + b, 0);

      const horaSitio = formatearHoraOFecha(r['HORA EN SITIO']);
      const solucionado = formatearHoraOFecha(r['SOLUCIONADO']);
      const tiempoRespuesta = convertirTiempoRespuestaMinutos(r['TIEMPO DE RESPUESTA ']);
      const estado = determinarEstado(r['SOLUCIONADO'], r['OBSERVACIONES']);

      const datosAdicionales = {
        origen: 'HISTORICO_LLUVIAS',
        numero_registro_excel: r['N°'],
        anio: r['AÑO'] ? String(r['AÑO']) : null,
        mes: r['MES'] ? String(r['MES']) : null,
        ficha: r['FICHA'] && r['FICHA'] !== 'NA' ? String(r['FICHA']).trim() : null,
        camara_cvvc: r['CÁMARA CVVC'] && r['CÁMARA CVVC'] !== 'NA' ? String(r['CÁMARA CVVC']).trim() : null,
        desaparecidos: parseInt(r['DESAPARECIDOS'], 10) || 0,
        fallecidos: parseInt(r['FALLECIDOS'], 10) || 0,
        via_afectada: parseInt(r['VIA AFECTADA'], 10) || 0,
        propiedad_publica: parseInt(r['PROPIEDAD PUBLICA'], 10) || 0,
        propiedad_privada: parseInt(r['PROPIEDAD PRIVADA'], 10) || 0,
        recursos,
        personal,
        total_recursos: totalRecursos,
        total_personal: totalPersonal,
        institucion_responsable: r['INSTITUCION'] && r['INSTITUCION'] !== 0 ? String(r['INSTITUCION']).trim() : null,
        observacion_secundaria: r['OBSERVACION2'] && r['OBSERVACION2'] !== 'NA' ? String(r['OBSERVACION2']).trim() : null,
      };

      novedadesLluvias.push({
        reporte_id: null,
        usuario_id: usuarioId,
        tipo,
        direccion: r['DIRECCIÓN'] ? String(r['DIRECCIÓN']).trim() : 'SIN DIRECCIÓN',
        aga: r['AGA'] && r['AGA'] !== 'NA' ? String(r['AGA']).trim() : null,
        instituciones: construirTagsInstituciones(recursos, r['INSTITUCION']),
        fecha: fechaEvento,
        latitud: isNaN(latitud) ? null : latitud,
        longitud: isNaN(longitud) ? null : longitud,
        recurso: r['RECURSOS'] && r['RECURSOS'] !== 'NA' ? String(r['RECURSOS']).trim() : null,
        estado,
        descripcion: r['EVENTO'] ? String(r['EVENTO']).trim() : 'EVENTO LLUVIAS',
        acciones: r['OBSERVACIONES'] && r['OBSERVACIONES'] !== 'NA' ? String(r['OBSERVACIONES']).trim() : null,
        hora_sitio: horaSitio,
        tiempo_respuesta: tiempoRespuesta,
        solucionado: solucionado,
        tiempo_atencion: null,
        datos_adicionales: datosAdicionales,
      });
    }

    console.log(` Preparadas ${novedadesLluvias.length} novedades de Lluvias para inserción.`);

    // ==========================================
    // 3. PROCESAR HOJA: ATM
    // ==========================================
    console.log('\n Leyendo hoja "ATM"...');
    const sheetAtm = wb.Sheets['ATM'];
    const filasAtm = xlsx.utils.sheet_to_json(sheetAtm);
    console.log(` Se encontraron ${filasAtm.length} filas en ATM.`);

    const novedadesAtm = [];

    for (const r of filasAtm) {
      if (!r['Tipo'] && !r['Referencia dirección']) continue;

      const fechaEvento = parsearFechaExcel(r['Fecha'], r['REPORTE']);
      const latitud = r['Latitud'] ? parseFloat(String(r['Latitud']).trim()) : null;
      const longitud = r['Longitud'] ? parseFloat(String(r['Longitud']).trim()) : null;

      const horaSitio = formatearHoraOFecha(r['PROCEDIMIENTO ']);
      const solucionado = formatearHoraOFecha(r['Finalizacion']);
      const tiempoRespuesta = convertirTiempoRespuestaMinutos(r['RESPUESTA']);

      const datosAdicionales = {
        origen: 'HISTORICO_ATM',
        numero_registro_excel: r['Nº'],
        codigo_incidente: r['T294976'] ? String(r['T294976']).trim() : null,
        canal: r['Canal'] ? String(r['Canal']).trim() : null,
        solicitante: r['Solicitante'] ? String(r['Solicitante']).trim() : null,
        num_solicitante: r['Num_Solicitante'] ? String(r['Num_Solicitante']).trim() : null,
        titulo_oncall: r['Titulo_OnCall'] ? String(r['Titulo_OnCall']).trim() : null,
        finalizacion_detalle: r['Finalizacion'] ? String(r['Finalizacion']).trim() : null,
        promedio_excel: r['PROMEDIO'] ? parseFloat(r['PROMEDIO']) : null,
        recursos: { atm: parseInt(r['RECURSO'], 10) || 1 },
        personal: { '#_atm': parseInt(r['PERSONAL'], 10) || 2 },
        total_recursos: parseInt(r['RECURSO'], 10) || 1,
        total_personal: parseInt(r['PERSONAL'], 10) || 2,
      };

      novedadesAtm.push({
        reporte_id: null,
        usuario_id: usuarioId,
        tipo: 'SINIESTRO',
        direccion: r['Referencia dirección'] ? String(r['Referencia dirección']).trim() : 'SIN DIRECCIÓN',
        aga: null, // ATM no tiene AGA en su hoja
        instituciones: '@atm',
        fecha: fechaEvento,
        latitud: isNaN(latitud) ? null : latitud,
        longitud: isNaN(longitud) ? null : longitud,
        recurso: r['RECURSO'] ? String(r['RECURSO']) : '1',
        estado: r['Finalizacion'] && r['Finalizacion'] !== '---' ? 'SOLUCIONADO' : 'PENDIENTE',
        descripcion: r['Tipo'] ? String(r['Tipo']).trim() : 'ACCIDENTE DE TRANSITO',
        acciones: r['Comentario'] ? String(r['Comentario']).trim() : null,
        hora_sitio: horaSitio,
        tiempo_respuesta: tiempoRespuesta,
        solucionado: solucionado,
        tiempo_atencion: null,
        datos_adicionales: datosAdicionales,
      });
    }

    console.log(` Preparadas ${novedadesAtm.length} novedades de ATM para inserción.`);

    // ==========================================
    // 4. INSERCIÓN EN LOTES (BATCHES)
    // ==========================================
    const totalAInsertar = novedadesLluvias.length + novedadesAtm.length;
    console.log(`\n Total de registros a insertar: ${totalAInsertar}`);

    const todasNovedades = [...novedadesLluvias, ...novedadesAtm];
    const BATCH_SIZE = 500;
    let insertados = 0;

    for (let i = 0; i < todasNovedades.length; i += BATCH_SIZE) {
      const lote = todasNovedades.slice(i, i + BATCH_SIZE);
      await Novedad.bulkCreate(lote, {
        validate: false, // Desactivar validación fila a fila para máxima velocidad
        hooks: false,    // Desactivar hooks para evitar recomputar tiempos ya calculados
      });
      insertados += lote.length;
      process.stdout.write(` Progreso: ${insertados}/${totalAInsertar} (${Math.round((insertados / totalAInsertar) * 100)}%)\r`);
    }

    console.log(`\n\n ¡IMPORTACIÓN COMPLETADA CON ÉXITO!`);
    console.log(` Resumen:`);
    console.log(`   - Novedades Lluvias insertadas: ${novedadesLluvias.length}`);
    console.log(`   - Novedades ATM insertadas:     ${novedadesAtm.length}`);
    console.log(`   - Total registros en BD:        ${insertados}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n Error durante la importación:', error);
    process.exit(1);
  }
}

importarDatos();
