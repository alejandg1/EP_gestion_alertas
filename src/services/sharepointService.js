const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');

// Lista exacta de 42 columnas requeridas para el Excel en SharePoint
const COLUMNAS_EXCEL = [
  "N°", "FECHA", "AÑO", "MES", "AGA", "HORA SOLICITUD", "DIRECCIÓN", "FICHA",
  "CÁMARA CVVC", "EVENTO", "DESAPARECIDOS", "FALLECIDOS", "VIA AFECTADA",
  "PROPIEDAD PUBLICA", "PROPIEDAD PRIVADA", "OBSERVACIONES", "BCBG", "ATM",
  "IA", "PARQUES EP", "OOPPMM", "CNEL", "URVASEO", "GGRR", "TOTAL RECURSOS",
  "#_BCBG", "#_ATM", "#_IA", "#_PARQUES EP", "#_OOPPMM", "#_CNEL", "#_URVASEO",
  "#_GGRR", "TOTAL PERSONAL", "RECURSOS", "LATITUD", "LONGITUD", "HORA EN SITIO",
  "TIEMPO DE RESPUESTA", "SOLUCIONADO", "INSTITUCION", "OBSERVACION2"
];

class SharePointExcelService {
  constructor() {
    this.client = null;
  }

  // Inicializar cliente de Microsoft Graph si las credenciales estan configuradas
  obtenerCliente() {
    const tenantId = (process.env.AZURE_TENANT_ID || '').trim();
    const clientId = (process.env.AZURE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.AZURE_CLIENT_SECRET || '').trim();

    if (!tenantId || !clientId || !clientSecret || tenantId === 'tu-tenant-id') {
      return null;
    }

    if (!this.client) {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      this.client = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
            return tokenResponse.token;
          }
        }
      });
    }
    return this.client;
  }

  // Formatear una novedad al arreglo de 42 columnas
  formatearFila(novedad, index, reporte) {
    const fechaObj = novedad.fecha_evento ? new Date(novedad.fecha_evento) : new Date();
    const anio = fechaObj.getFullYear() || new Date().getFullYear();
    const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
    const mes = meses[fechaObj.getMonth()] || "AGOSTO";

    return [
      novedad.numero_secuencial || (index + 1),                      // 1. N°
      novedad.fecha_evento || new Date().toISOString().split('T')[0],// 2. FECHA
      anio,                                                         // 3. AÑO
      mes,                                                          // 4. MES
      novedad.aga || "A09",                                         // 5. AGA
      novedad.hora_evento || "12:00",                               // 6. HORA SOLICITUD
      novedad.direccion || "",                                      // 7. DIRECCIÓN
      novedad.ficha || "",                                          // 8. FICHA
      novedad.camara_cvvc || "",                                    // 9. CÁMARA CVVC
      novedad.tipo_evento || "AGUA",                                // 10. EVENTO
      novedad.desaparecidos || 0,                                   // 11. DESAPARECIDOS
      novedad.fallecidos || 0,                                      // 12. FALLECIDOS
      novedad.via_afectada || "NO",                                 // 13. VIA AFECTADA
      novedad.propiedad_publica || "NO",                            // 14. PROPIEDAD PUBLICA
      novedad.propiedad_privada || "NO",                            // 15. PROPIEDAD PRIVADA
      novedad.descripcion || "",                                    // 16. OBSERVACIONES
      novedad.bcbg || "",                                           // 17. BCBG
      novedad.atm || "",                                            // 18. ATM
      novedad.ia || "",                                             // 19. IA
      novedad.parques_ep || "",                                     // 20. PARQUES EP
      novedad.ooppmm || "",                                         // 21. OOPPMM
      novedad.cnel || "",                                           // 22. CNEL
      novedad.urvaseo || "",                                        // 23. URVASEO
      novedad.ggrR || novedad.ggrr || "",                           // 24. GGRR
      novedad.total_recursos || 0,                                  // 25. TOTAL RECURSOS
      novedad.num_bcbg || 0,                                        // 26. #_BCBG
      novedad.num_atm || 0,                                         // 27. #_ATM
      novedad.num_ia || 0,                                          // 28. #_IA
      novedad.num_parques_ep || 0,                                  // 29. #_PARQUES EP
      novedad.num_ooppmm || 0,                                      // 30. #_OOPPMM
      novedad.num_cnel || 0,                                        // 31. #_CNEL
      novedad.num_urvaseo || 0,                                     // 32. #_URVASEO
      novedad.num_ggrr || 0,                                        // 33. #_GGRR
      novedad.total_personal || 0,                                  // 34. TOTAL PERSONAL
      novedad.recursos || "",                                       // 35. RECURSOS
      novedad.latitud !== undefined ? Number(novedad.latitud) : -2.1894, // 36. LATITUD
      novedad.longitud !== undefined ? Number(novedad.longitud) : -79.8891, // 37. LONGITUD
      novedad.hora_en_sitio || "",                                  // 38. HORA EN SITIO
      novedad.tiempo_respuesta || "",                               // 39. TIEMPO DE RESPUESTA
      novedad.solucionado || "EN PROCESO",                          // 40. SOLUCIONADO
      novedad.instituciones || "@emapagye",                         // 41. INSTITUCION
      novedad.acciones_inmediatas || reporte.elaborado_por || ""    // 42. OBSERVACION2 (incluye elaborado por)
    ];
  }

  // Registrar novedades en la tabla de SharePoint
  async registrarReporteEnExcel(reporte) {
    const client = this.obtenerCliente();
    const siteId = (process.env.SP_SITE_ID || '').trim();
    const driveId = (process.env.SP_DRIVE_ID || '').trim();
    const itemId = (process.env.SP_ITEM_ID || '').trim();
    const tableName = (process.env.SP_TABLE_NAME || 'TablaAlertas').trim();

    const filasParaInsertar = (reporte.novedades || []).map((nov, idx) => this.formatearFila(nov, idx, reporte));

    if (!client) {
      return {
        simulado: true,
        mensaje: 'Payload generado y validado con exito. Complete AZURE_TENANT_ID, AZURE_CLIENT_ID y AZURE_CLIENT_SECRET en el .env para envio en vivo.',
        total_filas: filasParaInsertar.length,
        columnas: COLUMNAS_EXCEL,
        filas: filasParaInsertar
      };
    }

    const endpoint = `/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/tables/${tableName}/rows/add`;
    const response = await client.api(endpoint).post({
      values: filasParaInsertar
    });

    return {
      simulado: false,
      mensaje: 'Novedades registradas exitosamente en el Excel de SharePoint',
      response
    };
  }
}

module.exports = {
  sharepointService: new SharePointExcelService(),
  COLUMNAS_EXCEL
};
