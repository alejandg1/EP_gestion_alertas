const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Sala Situacional - Sistema Colaborativo de Alertas',
      version: '1.0.0',
      description: `
### Documentacion OpenAPI y Comunicacion en Tiempo Real (WebSockets)

Este backend combina endpoints REST para operaciones transaccionales (autenticacion, subida de fotos, exportacion a SharePoint) y WebSockets (Socket.io) para colaboracion multi-operador en tiempo real.

---

### Protocolo de WebSockets (Socket.io)

* **URL de Conexion:** \`ws://localhost:3090\` (o \`http://localhost:3090\` mediante cliente Socket.io).
* **Path por defecto:** \`/socket.io/\`

#### Autenticacion en el Handshake
El WebSocket valida el JWT de sesion del operador:
\`\`\`javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3090', {
  auth: {
    token: 'TOKEN_JWT_DEL_LOGIN' // Obtenido en POST /auth/login
  }
});
\`\`\`

---

### Eventos emitidos por el Cliente (Client -> Server)

| Evento | Payload JSON | Descripcion |
| :--- | :--- | :--- |
| **\`unirse_reporte\`** | \`{ "reporteId": 1 }\` | Se une a la sala del reporte y solicita el estado actual con sus locks. |
| **\`lock_campo\`** | \`{ "reporteId": 1, "campoKey": "string" }\` | Notifica que el operador comenzo a editar un campo general (ej: \`numero_rds\`, \`inocar_pleamar\`). |
| **\`unlock_campo\`** | \`{ "reporteId": 1, "campoKey": "string" }\` | Libera el candado del campo al terminar la edicion (\`blur\`). |
| **\`actualizar_parametros\`** | \`{ "reporteId": 1, "parametros": { ... } }\` | Guarda y sincroniza cambios en los campos generales (RDS, INOCAR, horas de corte). |
| **\`agregar_novedad\`** | \`{ "reporteId": 1, "novedad": { ... } }\` | Envia una novedad redactada localmente. El servidor la guarda en PostgreSQL y la proyecta a todos. |
| **\`actualizar_novedad\`** | \`{ "reporteId": 1, "novedadId": 1, "cambios": { ... } }\` | Modifica en tiempo real los datos de una novedad existente (tipo, dirección, recurso, fotos, etc.). |
| **\`eliminar_novedad\`** | \`{ "reporteId": 1, "novedadId": 1 }\` | Elimina una novedad del reporte y sincroniza a todos los operadores conectados. |
| **\`eliminar_reporte\`** | \`{ "reporteId": 1 }\` | Elimina un reporte completo y notifica a los operadores conectados. |

---

### Eventos emitidos por el Servidor (Server -> Client Broadcast)

| Evento | Payload Recibido | Accion en Frontend |
| :--- | :--- | :--- |
| **\`reporte_cargado\`** | \`{ reporte, locks, usuariosActivos }\` | Carga el reporte, sus novedades, la autoria calculada y los campos bloqueados actualmente. |
| **\`reporte_eliminado\`** | \`{ reporteId, detalles, eliminadoPor }\` | Notifica la eliminación del reporte y remueve la vista activa. |
| **\`novedad_agregada\`** | \`{ novedad, colaboradores, elaborado_por }\` | Renderiza la novedad en la lista y actualiza automaticamente el campo Elaborado por. |
| **\`novedad_actualizada\`** | \`{ novedad, colaboradores, elaborado_por, actualizadoPor }\` | Actualiza la tarjeta de la novedad en pantalla sin recargar la lista. |
| **\`novedad_eliminada\`** | \`{ novedadId, colaboradores, elaborado_por, eliminadoPor }\` | Remueve la novedad de la interfaz y actualiza el conteo y la autoría. |
| **\`campo_bloqueado\`** | \`{ campoKey, usuarioId, usuarioNombre }\` | Deshabilita el input y muestra mensaje: En edicion por [Nombre]. |
| **\`campo_liberado\`** | \`{ campoKey }\` | Reactiva el input y retira el estado de bloqueo. |
| **\`parametros_actualizados\`** | \`{ reporteId, parametros, colaboradores, actualizadoPor }\` | Actualiza los valores de los parametros generales en pantalla sin recargar. |
| **\`usuarios_actualizados\`** | \`{ usuariosActivos: [{ usuarioId, nombre, correo }] }\` | Lista de operadores conectados en la sala del reporte. |
      `,
    },
    servers: [
      {
        url: 'http://10.10.80.70:3090',
        description: 'Servidor Principal (10.10.80.70:3090)',
      },
      {
        url: 'http://localhost:3090',
        description: 'Servidor Local (localhost:3090)',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido tras el inicio de sesión (/auth/login)',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-token',
          description: 'Token opcional de sistema',
        },
      },
      schemas: {
        RegistroUsuario: {
          type: 'object',
          required: ['correo', 'password'],
          properties: {
            correo: { type: 'string', example: 'operador@segura.gob.ec' },
            password: { type: 'string', example: 'password123' },
            nombre: { type: 'string', example: 'Operador Sala 1' },
          },
        },
        LoginUsuario: {
          type: 'object',
          required: ['correo', 'password'],
          properties: {
            correo: { type: 'string', example: 'operador@segura.gob.ec' },
            password: { type: 'string', example: 'password123' },
          },
        },
        CrearReporte: {
          type: 'object',
          properties: {
            titulo: { type: 'string', example: 'Reporte de Novedades e Incidentes - Turno Mañana' },
            observaciones_generales: { type: 'string', example: 'Monitoreo en tiempo real de lluvias y acumulación de agua.' },
            numero_rds: { type: 'string', example: 'SEGURA-EP-GASGEC-SS-2026-041 (Lluvias)' },
            fecha_reporte: { type: 'string', example: '2026-08-25' },
            hora_inicio: { type: 'string', example: '06:00' },
            hora_fin: { type: 'string', example: '22:00' },
            revisado_por: { type: 'string', example: 'Jefe de Sala Situacional | MSc. Ing. Santiago Jaramillo' },
            cabecera: { type: 'string', example: 'REPORTE DE NOVEDADES POR LLUVIAS INICIAL: 07/05/2026 21h30' },
            periodo: { type: 'string', example: 'Durante la noche del 7 de mayo se han registrado las siguientes novedades en el cantón Guayaquil por efecto de las lluvias:' },
            inocar_fecha: { type: 'string', example: '7 de mayo' },
            inocar_pleamar: { type: 'string', example: 'a las 22h42 con 4.13m' },
            inocar_bajamar: { type: 'string', example: 'a las 05h27 del 08/05/2026 con 0.79m' },
            usuario_id: { type: 'integer', example: 1, description: 'ID de usuario para agregarlo como colaborador inicial' },
            correo_colaborador: { type: 'string', example: 'operador2@segura.gob.ec', description: 'Correo del usuario a agregar como colaborador inicial' },
            colaboradores: {
              type: 'array',
              items: { type: 'string' },
              example: ['operador2@segura.gob.ec', 'operador3@segura.gob.ec'],
              description: 'Lista de IDs o correos de colaboradores a vincular'
            },
          },
        },
        ActualizarParametrosReporte: {
          type: 'object',
          properties: {
            numero_rds: { type: 'string', example: 'SEGURA-EP-GASGEC-SS-2026-041 (Lluvias)' },
            fecha_reporte: { type: 'string', example: '2026-08-25' },
            hora_inicio: { type: 'string', example: '06:00' },
            hora_fin: { type: 'string', example: '22:00' },
            revisado_por: { type: 'string', example: 'Jefe de Sala Situacional | MSc. Ing. Santiago Jaramillo' },
            cabecera: { type: 'string', example: 'REPORTE DE NOVEDADES POR LLUVIAS INICIAL: 07/05/2026 21h30' },
            periodo: { type: 'string', example: 'Durante la noche del 7 de mayo se han registrado las siguientes novedades en el cantón Guayaquil por efecto de las lluvias:' },
            inocar_fecha: { type: 'string', example: '7 de mayo' },
            inocar_pleamar: { type: 'string', example: 'a las 22h42 con 4.13m' },
            inocar_bajamar: { type: 'string', example: 'a las 05h27 del 08/05/2026 con 0.79m' },
            observaciones_generales: { type: 'string', example: 'Observaciones actualizadas.' },
          },
        },
        AgregarNovedad: {
          type: 'object',
          required: ['direccion'],
          properties: {
            tipo_evento: { 
              type: 'string', 
              enum: ['AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION'],
              example: 'AGUA'
            },
            tipo: { 
              type: 'string', 
              enum: ['AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION'],
              example: 'AGUA'
            },
            direccion: { type: 'string', example: 'PROSPERINA 6TO CALLEJON Y AV 41 DIAGONAL A LAS ROSAS' },
            aga: { type: 'string', example: 'A09' },
            instituciones: { type: 'string', example: '@emapagye @interagua' },
            fecha_evento: { type: 'string', example: '2026-08-25' },
            hora_evento: { type: 'string', example: '16:40' },
            fecha: { type: 'string', format: 'date-time', example: '2026-08-25T16:40:00Z' },
            latitud: { type: 'number', example: -2.1894 },
            longitud: { type: 'number', example: -79.8891 },
            recurso: { type: 'string', example: 'INS-ALC' },
            recurso_asignado: { type: 'string', example: 'INS-ALC' },
            estado: { type: 'string', enum: ['PENDIENTE', 'EN_SITIO', 'EN_ATENCION', 'SOLUCIONADO'], example: 'PENDIENTE' },
            estado_operativo: { type: 'string', example: 'PENDIENTE' },
            descripcion: { type: 'string', example: 'Acumulación de agua considerable en calzada con afectación al tránsito.' },
            acciones: { type: 'string', example: 'Se despachó cuadrilla de Interagua.' },
            acciones_inmediatas: { type: 'string', example: 'Se despachó cuadrilla de Interagua.' },
            hora_sitio: { type: 'string', example: '17:10' },
            solucionado: { type: 'string', example: '18:30' },
            reporte_id: { type: 'integer', example: 1, description: 'ID opcional del reporte al que se asocia la novedad' },
            datos_adicionales: {
              type: 'object',
              description: 'Metadatos adicionales en formato JSONB (ficha, camaras, conteo de recursos, etc.)',
              example: {
                ficha: 'FICHA-2026-001',
                camara_cvvc: 'CAM-09',
                via_afectada: 'SI',
                recursos: { BCBG: 1, ATM: 2 },
                personal: { BCBG: 3, ATM: 4 }
              }
            },
            recursos_instituciones: {
              type: 'object',
              description: 'Desglose de vehículos/recursos por institución',
              example: { BCBG: 1, ATM: 2 }
            },
            personal_instituciones: {
              type: 'object',
              description: 'Desglose de personal/efectivos por institución',
              example: { BCBG: 3, ATM: 4 }
            },
            fotos: {
              type: 'array',
              items: { type: 'string' },
              example: ['/uploads/fotos/foto-1724678123-123456789.jpg']
            },
          },
        },
        ActualizarNovedad: {
          type: 'object',
          properties: {
            tipo_evento: { 
              type: 'string', 
              enum: ['AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION'],
              example: 'AGUA'
            },
            tipo: { 
              type: 'string', 
              enum: ['AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION'],
              example: 'AGUA'
            },
            direccion: { type: 'string', example: 'PROSPERINA 6TO CALLEJON Y AV 41 DIAGONAL A LAS ROSAS' },
            aga: { type: 'string', example: 'A09' },
            instituciones: { type: 'string', example: '@emapagye @interagua' },
            fecha_evento: { type: 'string', example: '2026-08-25' },
            hora_evento: { type: 'string', example: '16:40' },
            fecha: { type: 'string', format: 'date-time', example: '2026-08-25T16:40:00Z' },
            latitud: { type: 'number', example: -2.1894 },
            longitud: { type: 'number', example: -79.8891 },
            recurso: { type: 'string', example: 'INS-ALC' },
            recurso_asignado: { type: 'string', example: 'INS-ALC' },
            estado: { type: 'string', enum: ['PENDIENTE', 'EN_SITIO', 'EN_ATENCION', 'SOLUCIONADO'], example: 'SOLUCIONADO' },
            estado_operativo: { type: 'string', example: 'SOLUCIONADO' },
            descripcion: { type: 'string', example: 'Novedad atendida y vía habilitada.' },
            acciones: { type: 'string', example: 'Se realizó limpieza de sumideros.' },
            acciones_inmediatas: { type: 'string', example: 'Se realizó limpieza de sumideros.' },
            hora_sitio: { type: 'string', example: '17:10' },
            solucionado: { type: 'string', example: '18:30' },
            reporte_id: { type: 'integer', example: 1 },
            datos_adicionales: {
              type: 'object',
              example: {
                ficha: 'FICHA-2026-001',
                solucionado: 'SI',
                recursos: { BCBG: 1, ATM: 2 },
                personal: { BCBG: 3, ATM: 4 }
              }
            },
            recursos_instituciones: {
              type: 'object',
              example: { BCBG: 1, ATM: 2 }
            },
            personal_instituciones: {
              type: 'object',
              example: { BCBG: 3, ATM: 4 }
            },
            fotos: {
              type: 'array',
              items: { type: 'string' },
              example: ['/uploads/fotos/foto-1724678123-123456789.jpg']
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './server.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
