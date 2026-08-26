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
El WebSocket valida el token institucional y el JWT de sesion del operador:
\`\`\`javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3090', {
  auth: {
    api_token: 'TU_SCRIPT_API_TOKEN', // Token del archivo .env
    token: 'TOKEN_JWT_DEL_LOGIN'        // Obtenido en POST /api/auth/login
  }
});
\`\`\`

---

### Eventos emitidos por el Cliente (Client -> Server)

| Evento | Payload JSON | Descripcion |
| :--- | :--- | :--- |
| **\`unirse_reporte\`** | \`{ "reporteId": "string" }\` | Se une a la sala del reporte y solicita el estado actual con sus locks. |
| **\`lock_campo\`** | \`{ "reporteId": "string", "campoKey": "string" }\` | Notifica que el operador comenzo a editar un campo general (ej: \`numero_rds\`, \`inocar_pleamar\`). |
| **\`unlock_campo\`** | \`{ "reporteId": "string", "campoKey": "string" }\` | Libera el candado del campo al terminar la edicion (\`blur\`). |
| **\`actualizar_parametros\`** | \`{ "reporteId": "string", "parametros": { ... } }\` | Guarda y sincroniza cambios en los campos generales (RDS, INOCAR, horas de corte). |
| **\`agregar_novedad\`** | \`{ "reporteId": "string", "novedad": { ... } }\` | Envia una novedad redactada localmente. El servidor la guarda en MongoDB y la proyecta a todos. |

---

### Eventos emitidos por el Servidor (Server -> Client Broadcast)

| Evento | Payload Recibido | Accion en Frontend |
| :--- | :--- | :--- |
| **\`reporte_cargado\`** | \`{ reporte, locks, usuariosActivos }\` | Carga el reporte, sus novedades, la autoria calculada y los campos bloqueados actualmente. |
| **\`novedad_agregada\`** | \`{ novedad, colaboradores, elaborado_por }\` | Renderiza la novedad en la lista y actualiza automaticamente el campo Elaborado por. |
| **\`campo_bloqueado\`** | \`{ campoKey, usuarioId, usuarioNombre }\` | Deshabilita el input y muestra mensaje: En edicion por [Nombre]. |
| **\`campo_liberado\`** | \`{ campoKey }\` | Reactiva el input y retira el estado de bloqueo. |
| **\`parametros_actualizados\`** | \`{ reporteId, parametros, actualizadoPor }\` | Actualiza los valores de los parametros generales en pantalla sin recargar. |
| **\`usuarios_actualizados\`** | \`{ usuariosActivos: [{ usuarioId, nombre, correo }] }\` | Lista de operadores conectados en la sala del reporte. |
      `,
    },
    servers: [
      {
        url: `/`,
        description: 'Servidor Local',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-token',
          description: 'Token de sistema del .env (SCRIPT_API_TOKEN)',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido tras el inicio de sesión',
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
            estado: { type: 'string', enum: ['BORRADOR', 'ACTIVO', 'FINALIZADO', 'EXPORTADO_EXCEL'], example: 'ACTIVO' },
          },
        },
        AgregarNovedad: {
          type: 'object',
          required: ['direccion'],
          properties: {
            tipo_evento: { 
              type: 'string', 
              enum: ['AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION', 'OTRO'],
              example: 'AGUA'
            },
            direccion: { type: 'string', example: 'PROSPERINA 6TO CALLEJON Y AV 41 DIAGONAL A LAS ROSAS' },
            aga: { type: 'string', example: 'A09' },
            instituciones: { type: 'string', example: '@emapagye @interagua' },
            fecha_evento: { type: 'string', example: '2026-08-25' },
            hora_evento: { type: 'string', example: '16:40' },
            latitud: { type: 'number', example: -2.1894 },
            longitud: { type: 'number', example: -79.8891 },
            recurso_asignado: { type: 'string', example: 'INS-ALC 🚙' },
            estado_operativo: { type: 'string', example: '⛔PENDIENTE' },
            descripcion: { type: 'string', example: 'Acumulación de agua considerable en calzada con afectación al tránsito.' },
            acciones_inmediatas: { type: 'string', example: 'Se despachó cuadrilla de Interagua.' },
            fotos: {
              type: 'array',
              items: { type: 'string' },
              example: ['/uploads/fotos/foto-1724678123-123456789.jpg']
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
