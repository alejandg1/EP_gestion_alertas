require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const logger = require('./src/config/logger');
const { connectDB, sequelize } = require('./src/config/database');
const { Usuario, Reporte, Novedad, NovedadFoto, Sesion, Auditoria } = require('./src/models');
const swaggerSpec = require('./src/config/swagger');
const authRoutes = require('./src/routes/authRoutes');
const reporteRoutes = require('./src/routes/reporteRoutes');
const novedadRoutes = require('./src/routes/novedadRoutes');
const initCollaborationSockets = require('./src/sockets/collaborationSocket');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }
});

(async () => {
  await connectDB();
  await sequelize.sync({ alter: true });
  logger.info('Tablas de PostgreSQL sincronizadas correctamente con Sequelize');
})();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const morganStream = {
  write: (message) => logger.info(message.trim(), { context: 'HTTP' }),
};
app.use(morgan(':remote-addr - :method :url :status :res[content-length] - :response-time ms', { stream: morganStream }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Swagger - Sala Situacional Segura EP',
  swaggerOptions: {
    persistAuthorization: true,
    validatorUrl: null,
    supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch']
  }
}));

app.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use('/auth', authRoutes);
app.use('/reportes', reporteRoutes);
app.use('/novedades', novedadRoutes);

app.get('/', (req, res) => {
  res.json({
    ok: true,
    servicio: 'Sistema de Gestión de Alertas y Novedades - Sala Situacional',
    bd: 'PostgreSQL',
    timestamp: new Date().toISOString(),
    docs: `http://localhost:${process.env.PORT || 3090}/docs`,
    openapi_json: `http://localhost:${process.env.PORT || 3090}/docs.json`,
  });
});

initCollaborationSockets(io);

const PORT = process.env.PORT || 3090;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  logger.info(`Servidor ejecutandose en http://${HOST}:${PORT}`);
  logger.info(`Documentacion OpenAPI Swagger UI: http://localhost:${PORT}/docs`);
  logger.info(`Especificacion OpenAPI JSON (Postman/Insomnia): http://localhost:${PORT}/docs.json`);
});


