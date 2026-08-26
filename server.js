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

// Inicializar Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }
});

// Conectar a MongoDB
connectDB();

// Middlewares Globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estaticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Documentacion OpenAPI / Swagger UI interactiva
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Swagger - Sala Situacional Segura EP',
  swaggerOptions: {
    persistAuthorization: true,
  }
}));

// Endpoint para exportar la especificacion OpenAPI en formato JSON estandar
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Rutas de API REST
app.use('/api/auth', authRoutes);
app.use('/api/reportes', reporteRoutes);

// Endpoint de estado / healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'Sistema Colaborativo Sala Situacional',
    timestamp: new Date().toISOString(),
    docs: `http://localhost:${process.env.PORT || 3090}/api/docs`,
    openapi_json: `http://localhost:${process.env.PORT || 3090}/api/docs.json`,
  });
});

// Inicializar sockets de colaboracion
initCollaborationSockets(io);

// Puerto
const PORT = process.env.PORT || 3090;
server.listen(PORT, () => {
  console.log(`[INFO] Servidor ejecutandose en http://localhost:${PORT}`);
  console.log(`[INFO] Documentacion OpenAPI Swagger UI: http://localhost:${PORT}/api/docs`);
  console.log(`[INFO] Especificacion OpenAPI JSON (Postman/Insomnia): http://localhost:${PORT}/api/docs.json`);
});
