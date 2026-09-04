require('dotenv').config();
const { sequelize } = require('../src/config/database');

async function crearVistaPowerBI() {
  try {
    await sequelize.authenticate();
    const query = `
      CREATE OR REPLACE VIEW vista_powerbi_historicos AS
      SELECT 
        n.id,
        n.datos_adicionales->>'origen' AS origen,
        (n.datos_adicionales->>'numero_registro_excel')::INTEGER AS numero_registro_excel,
        n.fecha,
        DATE(n.fecha) AS fecha_dia,
        EXTRACT(YEAR FROM n.fecha)::INTEGER AS anio,
        TO_CHAR(n.fecha, 'Month') AS mes_nombre,
        EXTRACT(MONTH FROM n.fecha)::INTEGER AS mes_numero,
        n.tipo,
        n.descripcion AS evento,
        n.direccion,
        n.aga,
        n.instituciones,
        n.latitud,
        n.longitud,
        n.estado,
        n.acciones AS observaciones,
        n.hora_sitio,
        n.tiempo_respuesta AS tiempo_respuesta_minutos,
        n.solucionado AS hora_solucionado,
        n.datos_adicionales->>'ficha' AS ficha,
        n.datos_adicionales->>'camara_cvvc' AS camara_cvvc,
        (n.datos_adicionales->>'total_recursos')::INTEGER AS total_recursos,
        (n.datos_adicionales->>'total_personal')::INTEGER AS total_personal,
        COALESCE((n.datos_adicionales->'recursos'->>'bcbg')::INTEGER, 0) AS recursos_bcbg,
        COALESCE((n.datos_adicionales->'recursos'->>'ia')::INTEGER, 0) AS recursos_interagua,
        COALESCE((n.datos_adicionales->'recursos'->>'parques_ep')::INTEGER, 0) AS recursos_parques_ep,
        COALESCE((n.datos_adicionales->'recursos'->>'atm')::INTEGER, 0) AS recursos_atm,
        COALESCE((n.datos_adicionales->'recursos'->>'cnel')::INTEGER, 0) AS recursos_cnel,
        COALESCE((n.datos_adicionales->'recursos'->>'urvaseo')::INTEGER, 0) AS recursos_urvaseo,
        COALESCE((n.datos_adicionales->'recursos'->>'ooppmm')::INTEGER, 0) AS recursos_ooppmm,
        COALESCE((n.datos_adicionales->'recursos'->>'ggrr')::INTEGER, 0) AS recursos_ggrr,
        COALESCE((n.datos_adicionales->'personal'->>'#_bcbg')::INTEGER, 0) AS personal_bcbg,
        COALESCE((n.datos_adicionales->'personal'->>'#_ia')::INTEGER, 0) AS personal_interagua,
        COALESCE((n.datos_adicionales->'personal'->>'#_parques_ep')::INTEGER, 0) AS personal_parques_ep,
        COALESCE((n.datos_adicionales->'personal'->>'#_atm')::INTEGER, 0) AS personal_atm,
        COALESCE((n.datos_adicionales->'personal'->>'#_cnel')::INTEGER, 0) AS personal_cnel,
        COALESCE((n.datos_adicionales->'personal'->>'#_urvaseo')::INTEGER, 0) AS personal_urvaseo,
        COALESCE((n.datos_adicionales->'personal'->>'#_ooppmm')::INTEGER, 0) AS personal_ooppmm,
        COALESCE((n.datos_adicionales->'personal'->>'#_ggrr')::INTEGER, 0) AS personal_ggrr,
        COALESCE((n.datos_adicionales->>'desaparecidos')::INTEGER, 0) AS desaparecidos,
        COALESCE((n.datos_adicionales->>'fallecidos')::INTEGER, 0) AS fallecidos,
        COALESCE((n.datos_adicionales->>'via_afectada')::INTEGER, 0) AS via_afectada,
        COALESCE((n.datos_adicionales->>'propiedad_publica')::INTEGER, 0) AS propiedad_publica,
        COALESCE((n.datos_adicionales->>'propiedad_privada')::INTEGER, 0) AS propiedad_privada,
        n.datos_adicionales->>'codigo_incidente' AS codigo_incidente_atm,
        n.datos_adicionales->>'canal' AS canal_atm,
        n.datos_adicionales->>'solicitante' AS solicitante_atm,
        n.datos_adicionales->>'titulo_oncall' AS titulo_oncall_atm
      FROM novedad n
      WHERE n.deleted_at IS NULL;
    `;
    await sequelize.query(query);
    console.log(' Vista "vista_powerbi_historicos" creada/actualizada exitosamente en PostgreSQL.');
    process.exit(0);
  } catch (err) {
    console.error('Error al crear la vista:', err);
    process.exit(1);
  }
}

crearVistaPowerBI();
