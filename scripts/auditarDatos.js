require('dotenv').config();
const { Novedad } = require('../src/models');
const xlsx = require('xlsx');
const path = require('path');

async function auditarDatos() {
  try {
    const wb = xlsx.readFile(path.join(__dirname, '..', 'REGISTRO DE EVENTOS ADVERSOS - EPOCA LLUVIOSA1.xlsx'));
    
    // 1. Conteo global
    const s1 = xlsx.utils.sheet_to_json(wb.Sheets['LLUVIAS 2024 - 2026']).filter(r => r['EVENTO'] || r['DIRECCIÓN']);
    const sAtm = xlsx.utils.sheet_to_json(wb.Sheets['ATM']).filter(r => r['Tipo'] || r['Referencia dirección']);
    
    const countLluviasBD = await Novedad.count({ where: { 'datos_adicionales.origen': 'HISTORICO_LLUVIAS' } });
    const countAtmBD = await Novedad.count({ where: { 'datos_adicionales.origen': 'HISTORICO_ATM' } });

    console.log('==================================================');
    console.log(' AUDITORÍA DE CONTEO TOTAL:');
    console.log(` - LLUVIAS: Excel (${s1.length} válidas) vs BD (${countLluviasBD} registros) -> ${s1.length === countLluviasBD ? 'COINCIDENCIA EXACTA (100%)' : 'DIFERENCIA'}`);
    console.log(` - ATM:     Excel (${sAtm.length} válidas) vs BD (${countAtmBD} registros)     -> ${sAtm.length === countAtmBD ? 'COINCIDENCIA EXACTA (100%)' : 'DIFERENCIA'}`);
    console.log('==================================================\n');

    // 2. Muestreo de cotejo campo por campo
    const sampleNumbers = [1, 50, 500, 1000, 1882, 2672];
    const s1Map = new Map();
    s1.forEach(r => s1Map.set(r['N°'], r));

    for (const num of sampleNumbers) {
      const rExcel = s1Map.get(num);
      const rBD = await Novedad.findOne({
        where: {
          'datos_adicionales.numero_registro_excel': num,
          'datos_adicionales.origen': 'HISTORICO_LLUVIAS'
        }
      });

      if (rExcel && rBD) {
        console.log(`--- Cotejo LLUVIAS N° ${num} ---`);
        console.log(` Direccion:       [Excel] "${rExcel['DIRECCIÓN']}" | [BD] "${rBD.direccion}"`);
        console.log(` Evento:          [Excel] "${rExcel['EVENTO']}" | [BD] "${rBD.descripcion}"`);
        console.log(` AGA:             [Excel] "${rExcel['AGA']}" | [BD] "${rBD.aga}"`);
        console.log(` Coordenadas:     [Excel] (${rExcel['LATITUD']}, ${rExcel['LONGITUD']}) | [BD] (${rBD.latitud}, ${rBD.longitud})`);
        console.log(` Ficha:           [Excel] "${rExcel['FICHA']}" | [BD] "${rBD.datos_adicionales.ficha}"`);
        console.log(` Total Recursos:  [Excel] ${rExcel['TOTAL RECURSOS']} | [BD] ${rBD.datos_adicionales.total_recursos}`);
        console.log(` Total Personal:  [Excel] ${rExcel['TOTAL PERSONAL']} | [BD] ${rBD.datos_adicionales.total_personal}`);
        console.log(` T. Respuesta:    [Excel] ${rExcel['TIEMPO DE RESPUESTA ']} | [BD] ${rBD.tiempo_respuesta} min`);
        console.log(` Institución:     [Excel] "${rExcel['INSTITUCION']}" | [BD Instituciones] "${rBD.instituciones}"`);
        console.log('--------------------------------------------------\n');
      }
    }

    // 3. Muestreo ATM
    const sampleAtm = [1, 25, 75, 125];
    const sAtmMap = new Map();
    sAtm.forEach(r => sAtmMap.set(r['Nº'], r));

    for (const num of sampleAtm) {
      const rExcel = sAtmMap.get(num);
      const rBD = await Novedad.findOne({
        where: {
          'datos_adicionales.numero_registro_excel': num,
          'datos_adicionales.origen': 'HISTORICO_ATM'
        }
      });

      if (rExcel && rBD) {
        console.log(`--- Cotejo ATM N° ${num} ---`);
        console.log(` Tipo:         [Excel] "${rExcel['Tipo']}" | [BD] "${rBD.descripcion}"`);
        console.log(` Incidente ID: [Excel] "${rExcel['T294976']}" | [BD] "${rBD.datos_adicionales.codigo_incidente}"`);
        console.log(` Dirección:    [Excel] "${rExcel['Referencia dirección']}" | [BD] "${rBD.direccion}"`);
        console.log(` Canal:        [Excel] "${rExcel['Canal']}" | [BD] "${rBD.datos_adicionales.canal}"`);
        console.log(` Solicitante:  [Excel] "${rExcel['Solicitante']}" | [BD] "${rBD.datos_adicionales.solicitante}"`);
        console.log(` Coordenadas:  [Excel] (${rExcel['Latitud']}, ${rExcel['Longitud']}) | [BD] (${rBD.latitud}, ${rBD.longitud})`);
        console.log(` T. Respuesta: [Excel] ${rExcel['RESPUESTA']} | [BD] ${rBD.tiempo_respuesta} min`);
        console.log('--------------------------------------------------\n');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error en auditoría:', err);
    process.exit(1);
  }
}

auditarDatos();
