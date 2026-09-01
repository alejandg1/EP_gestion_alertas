const { Sequelize } = require('sequelize');
const logger = require('./logger');

const dbName = process.env.DB_NAME || 'sala_situacional';
const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'postgres';
const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = process.env.DB_PORT || 5432;

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: 'postgres',
  logging: (msg) => logger.debug(msg),
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
  }
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info(`PostgreSQL conectado exitosamente a la BD: ${dbName} en ${dbHost}:${dbPort}`);
  } catch (error) {
    logger.error(`Error conectando a PostgreSQL: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };


