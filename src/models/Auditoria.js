const mongoose = require('mongoose');

const auditoriaSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: false,
  },
  usuario_correo: {
    type: String,
    default: 'sistema',
  },
  reporte_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reporte',
    required: false,
  },
  entidad: {
    type: String,
    enum: ['USUARIO', 'SESION', 'REPORTE', 'NOVEDAD', 'SISTEMA'],
    required: true,
  },
  accion: {
    type: String,
    enum: ['LOGIN', 'REGISTRO', 'LOGOUT', 'CREAR', 'EDITAR', 'ELIMINAR', 'LOCK_CAMPO', 'UNLOCK_CAMPO'],
    required: true,
  },
  detalles: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ip: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Auditoria', auditoriaSchema);
