const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Sala Situacional - Sistema Colaborativo de Alertas',
      version: '1.0.0',
      description: 'Documentación OpenAPI interactiva para el sistema de alertas de Segura EP. Requiere el SCRIPT_API_TOKEN institucional y JWT de sesión.',
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
          required: ['titulo'],
          properties: {
            titulo: { type: 'string', example: 'Reporte de Novedades e Incidentes - Turno Mañana' },
            observaciones_generales: { type: 'string', example: 'Monitoreo en tiempo real de lluvias y acumulación de agua.' },
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
            descripcion: { type: 'string', example: 'Acumulación de agua considerable en calzada con afectación al tránsito.' },
            acciones_inmediatas: { type: 'string', example: 'Se despachó cuadrilla de Interagua.' },
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
