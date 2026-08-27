const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
  correo: {
    type: String,
    required: [true, 'El correo es obligatorio'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@(mail\.)?seguraep\.gob\.ec$/,
      'El correo institucional debe pertenecer al dominio @seguraep.gob.ec o @mail.seguraep.gob.ec'
    ],
  },

  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    minlength: 4,
  },
  nombre: {
    type: String,
    trim: true,
    default: function () {
      return this.correo ? this.correo.split('@')[0] : 'Operador';
    }
  },
  rol: {
    type: String,
    enum: ['operador', 'admin'],
    default: 'operador',
  },
  requiere_cambio_pw: {
    type: Boolean,
    default: false,
  },
  creado_en: {
    type: Date,
    default: Date.now,
  }
});

usuarioSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

usuarioSchema.methods.compararPassword = async function (candidata) {
  return await bcrypt.compare(candidata, this.password);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
