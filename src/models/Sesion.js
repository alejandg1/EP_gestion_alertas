const mongoose = require('mongoose');

const sesionSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  ip: {
    type: String,
    default: '127.0.0.1',
  },
  user_agent: {
    type: String,
    default: 'Web Browser',
  },
  inicio: {
    type: Date,
    default: Date.now,
  },
  ultimo_acceso: {
    type: Date,
    default: Date.now,
  },
  activo: {
    type: Boolean,
    default: true,
  }
});

sesionSchema.index({ usuario_id: 1, activo: 1 });

module.exports = mongoose.model('Sesion', sesionSchema);
