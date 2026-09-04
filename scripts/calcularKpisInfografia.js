require('dotenv').config();
const { sequelize } = require('../src/config/database');

async function calcularKpisInfografia() {
  try {
    const [res] = await sequelize.query(`
      SELECT 
        COUNT(*) FILTER (WHERE anio = 2026 AND evento = 'ACUMULACION DE AGUA') AS vias_anegadas,
        COUNT(*) FILTER (WHERE anio = 2026 AND evento = 'CAIDA DE ARBOL') AS caida_arbol,
        COUNT(*) FILTER (WHERE anio = 2026 AND (evento = 'INUNDACION' OR evento = 'INUNDACION ')) AS inundaciones,
        COUNT(*) FILTER (WHERE anio = 2026 AND (evento = 'COLAPSO ESTRUCTURAL' OR evento LIKE '%COLAPSO%')) AS colapsos,
        COUNT(*) FILTER (WHERE anio = 2026 AND (evento = 'SUBSIDENCIAS' OR evento LIKE '%SOCAV%')) AS subsidencias,
        COUNT(*) FILTER (WHERE anio = 2026 AND evento = 'DESLIZAMIENTO DE TIERRA') AS deslizamientos,
        COUNT(*) FILTER (WHERE anio = 2026 AND evento = 'VENDAVAL') AS vendaval,
        COUNT(*) FILTER (WHERE anio = 2026 AND origen = 'HISTORICO_ATM') AS siniestros_transito,
        SUM(fallecidos) FILTER (WHERE anio = 2026) AS fallecidos,
        SUM(via_afectada) FILTER (WHERE anio = 2026) AS vias_afectadas,
        SUM(propiedad_publica) FILTER (WHERE anio = 2026) AS propiedad_publica,
        SUM(propiedad_privada) FILTER (WHERE anio = 2026) AS propiedad_privada,
        SUM(total_recursos) FILTER (WHERE anio = 2026 AND origen = 'HISTORICO_LLUVIAS') AS recursos_desplegados,
        SUM(total_personal) FILTER (WHERE anio = 2026 AND origen = 'HISTORICO_LLUVIAS') AS personal_desplegado,
        COUNT(*) FILTER (WHERE anio = 2026 AND origen = 'HISTORICO_LLUVIAS') AS total_eventos_lluvias
      FROM vista_powerbi_historicos;
    `);

    console.log('==============================================');
    console.log(' COMPARATIVA CON LA INFOGRAFÍA SEGURA EP 2026:');
    console.log('==============================================');
    console.log(JSON.stringify(res[0], null, 2));

    const [porMes] = await sequelize.query(`
      SELECT 
        mes_nombre,
        mes_numero,
        COUNT(*) AS total_eventos
      FROM vista_powerbi_historicos
      WHERE anio = 2026 AND origen = 'HISTORICO_LLUVIAS'
      GROUP BY mes_nombre, mes_numero
      ORDER BY mes_numero;
    `);
    console.log('\n--- EVENTOS POR MES (2026) ---');
    console.table(porMes);

    process.exit(0);
  } catch (err) {
    console.error('Error calculando KPIs:', err);
    process.exit(1);
  }
}

calcularKpisInfografia();
