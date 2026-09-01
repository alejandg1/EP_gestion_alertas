require('dotenv').config();
const path = require('path');
const xlsx = require('xlsx');
const { sequelize, Usuario, Novedad } = require('../src/models');
const logger = require('../src/config/logger');

// Mapeo seguro de tipo de evento
const MAPA_EVENTOS = {
  'AGUA': 'AGUA',
  'ARBOL': 'ARBOL',
  'ÁRBOL': 'ARBOL',
  'DESLIZAMIENTO': 'DESLIZAMIENTO',
  'POSTE': 'POSTE',
  'SINIESTRO': 'SINIESTRO',
  'INUNDACION': 'INUNDACION',
  'INUNDACIÓN': 'INUNDACION',
  'VENDAVAL': 'VENDAVAL',
  'AFECTACION': 'AFECTACION',
  'AFECTACIÓN': 'AFECTACION',
};

async function importarExcel(rutaArchivo) {
  try {
    const fullPath = path.isAbsolute(rutaArchivo) ? rutaArchivo : path.join(__dirname, '..', rutaArchivo);
    console.log(`Leyendo archivo Excel desde: ${fullPath}`);

    const workbook = xlsx.readFile(fullPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const filas = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    console.log(`Total de filas encontradas en el Excel: ${filas.length}`);

    await sequelize.authenticate();

    // 1. Asegurar usuario de sistema para atribuir las novedades importadas
    let [usuarioSistema] = await Usuario.findOrCreate({
      where: { correo: 'sistema@seguraep.gob.ec' },
      defaults: {
        nombre: 'Sistema Importador',
        password: 'Password123#Sistema!',
        rol: 'admin',
        requiere_cambio_pw: false,
      }
    });

    console.log(`Usuario asignado para importación: ${usuarioSistema.correo} (ID: ${usuarioSistema.id})`);

    const novedadesParaInsertar = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];

      // Extraer campos principales
      const eventoRaw = String(fila['EVENTO'] || fila['TIPO'] || 'AGUA').trim().toUpperCase();
      const tipoEvento = MAPA_EVENTOS[eventoRaw] || 'OTRO';

      const fechaStr = fila['FECHA'] || fila['FECHA DE NOVEDAD'];
      let fechaFinal = new Date();
      if (fechaStr) {
        const parsed = new Date(fechaStr);
        if (!isNaN(parsed.getTime())) fechaFinal = parsed;
      }

      const lat = Number(fila['LATITUD'] || fila['LAT']) || -2.1894;
      const lng = Number(fila['LONGITUD'] || fila['LNG'] || fila['LONG']) || -79.8891;

      // El resto de campos se empaquetan en datos_adicionales (JSONB)
      const datosAdicionales = {
        numero_excel: fila['N°'] || (i + 1),
        anio: fila['AÑO'] || '',
        mes: fila['MES'] || '',
        hora_solicitud: fila['HORA SOLICITUD'] || '',
        ficha: fila['FICHA'] || '',
        camara_cvvc: fila['CÁMARA CVVC'] || '',
        desaparecidos: Number(fila['DESAPARECIDOS']) || 0,
        fallecidos: Number(fila['FALLECIDOS']) || 0,
        via_afectada: fila['VIA AFECTADA'] || 'NO',
        propiedad_publica: fila['PROPIEDAD PUBLICA'] || 'NO',
        propiedad_privada: fila['PROPIEDAD PRIVADA'] || 'NO',
        hora_en_sitio: fila['HORA EN SITIO'] || '',
        tiempo_respuesta: fila['TIEMPO DE RESPUESTA'] || '',
        solucionado: fila['SOLUCIONADO'] || 'SOLUCIONADO',
        recursos_detalle: {
          bcbg: fila['BCBG'] || '',
          atm: fila['ATM'] || '',
          ia: fila['IA'] || '',
          parques_ep: fila['PARQUES EP'] || '',
          ooppmm: fila['OOPPMM'] || '',
          cnel: fila['CNEL'] || '',
          urvaseo: fila['URVASEO'] || '',
          ggrr: fila['GGRR'] || '',
        },
        conteo_recursos: {
          num_bcbg: Number(fila['#_BCBG']) || 0,
          num_atm: Number(fila['#_ATM']) || 0,
          num_ia: Number(fila['#_IA']) || 0,
          num_parques_ep: Number(fila['#_PARQUES EP']) || 0,
          num_ooppmm: Number(fila['#_OOPPMM']) || 0,
          num_cnel: Number(fila['#_CNEL']) || 0,
          num_urvaseo: Number(fila['#_URVASEO']) || 0,
          num_ggrr: Number(fila['#_GGRR']) || 0,
          total_recursos: Number(fila['TOTAL RECURSOS']) || 0,
          total_personal: Number(fila['TOTAL PERSONAL']) || 0,
        },
        observaciones_adicionales: fila['OBSERVACION2'] || '',
      };

      novedadesParaInsertar.push({
        reporte_id: null, // HISTÓRICO SIN REPORTE
        usuario_id: usuarioSistema.id,
        tipo: tipoEvento,
        direccion: fila['DIRECCIÓN'] || fila['DIRECCION'] || 'Sin dirección',
        aga: fila['AGA'] || 'A09',
        instituciones: fila['INSTITUCION'] || fila['INSTITUCIONES'] || '@emapagye @interagua',
        fecha: fechaFinal,
        latitud: lat,
        longitud: lng,
        recurso: fila['RECURSOS'] || '',
        estado: fila['ESTADO'] || 'CERRADO',
        descripcion: fila['OBSERVACIONES'] || fila['DESCRIPCION'] || '',
        acciones: fila['ACCIONES'] || '',
        datos_adicionales: datosAdicionales,
      });
    }

    console.log(`Iniciando inserción en PostgreSQL...`);
    const transaction = await sequelize.transaction();

    try {
      await Novedad.bulkCreate(novedadesParaInsertar, { transaction });
      await transaction.commit();
      console.log(`✅ ¡Importación finalizada con éxito! ${novedadesParaInsertar.length} novedades históricas registradas en PostgreSQL.`);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

  } catch (error) {
    console.error(`❌ Error en la importación: ${error.message}`);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Permitir ejecución directa pasando la ruta del archivo: node scripts/importarExcelNovedades.js ./historico.xlsx
const archivoArg = process.argv[2] || 'historico.xlsx';
importarExcel(archivoArg);
