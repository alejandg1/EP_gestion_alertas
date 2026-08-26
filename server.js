require('dotenv').config({ path: './env' });
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./src/config/database');
const swaggerSpec = require('./src/config/swagger');
const authRoutes = require('./src/routes/authRoutes');
const reporteRoutes = require('./src/routes/reporteRoutes');
const initCollaborationSockets = require('./src/sockets/collaborationSocket');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }
});

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Swagger - Sala Situacional Segura EP',
  swaggerOptions: {
    persistAuthorization: true,
  }
}));

app.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use('/auth', authRoutes);
app.use('/reportes', reporteRoutes);

app.get('/', (req, res) => {
  res.json({
    ok: true,
    servicio: 'Sistema Colaborativo Sala Situacional',
    timestamp: new Date().toISOString(),
    docs: `http://localhost:${process.env.PORT || 3090}/docs`,
    openapi_json: `http://localhost:${process.env.PORT || 3090}/docs.json`,
  });
});

initCollaborationSockets(io);

const PORT = process.env.PORT || 3090;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`[INFO] Servidor ejecutandose en http://${HOST}:${PORT}`);
  console.log(`[INFO] Documentacion OpenAPI Swagger UI: http://localhost:${PORT}/docs`);
  console.log(`[INFO] Especificacion OpenAPI JSON (Postman/Insomnia): http://localhost:${PORT}/docs.json`);
});
