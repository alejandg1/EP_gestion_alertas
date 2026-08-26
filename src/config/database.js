const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME || 'sala_situacional';
    
    await mongoose.connect(uri, {
      dbName: dbName,
    });
    
    console.log(`[INFO] MongoDB conectado exitosamente a la BD: ${dbName}`);
  } catch (error) {
    console.error('[ERROR] Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
