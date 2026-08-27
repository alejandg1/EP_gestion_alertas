const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
    const dbName = process.env.DB_NAME || 'sala_situacional';
    
    if (!process.env.MONGODB_URI) {
      logger.warn(`Variable MONGODB_URI no definida en .env. Usando por defecto: ${uri}`);
    }

    await mongoose.connect(uri, {
      dbName: dbName,
    });

    
    logger.info(`MongoDB conectado exitosamente a la BD: ${dbName}`);
  } catch (error) {
    logger.error(`Error conectando a MongoDB: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
};

module.exports = connectDB;

