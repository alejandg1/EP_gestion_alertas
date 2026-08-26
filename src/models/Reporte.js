const mongoose = require('mongoose');

// Subesquema de Novedad (1:N con Reporte)
const novedadSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: false,
  },
  usuario_nombre: {
    type: String,
    default: 'Operador',
  },
  tipo_evento: {
    type: String,
    enum: ['AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION', 'OTRO'],
    default: 'AGUA',
  },
  direccion: {
    type: String,
    required: true,
    trim: true,
  },
  aga: {
    type: String,
    default: 'A09',
    trim: true,
  },
  instituciones: {
    type: String,
    default: '@emapagye @interagua',
    trim: true,
  },
  fecha_evento: {
    type: String,
    default: () => new Date().toISOString().split('T')[0],
  },
  hora_evento: {
    type: String,
    default: () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
  },
  latitud: {
    type: Number,
    default: -2.1894, // Guayaquil default
  },
  longitud: {
    type: Number,
    default: -79.8891,
  },
  descripcion: {
    type: String,
    default: '',
  },
  acciones_inmediatas: {
    type: String,
    default: '',
  },
  estado_novedad: {
    type: String,
    enum: ['ABIERTO', 'EN_ATENCION', 'CERRADO'],
    default: 'ABIERTO',
  },
  creado_en: {
    type: Date,
    default: Date.now,
  },
  actualizado_en: {
    type: Date,
    default: Date.now,
  }
});

// Subesquema de Colaborador (N:N con Usuarios)
const colaboradorSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  correo: {
    type: String,
    required: true,
  },
  primer_aporte: {
    type: Date,
    default: Date.now,
  },
  ultimo_aporte: {
    type: Date,
    default: Date.now,
  },
  total_ediciones: {
    type: Number,
    default: 1,
  }
}, { _id: false });

const reporteSchema = new mongoose.Schema({
  codigo: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  titulo: {
    type: String,
    required: [true, 'El título del reporte es obligatorio'],
    trim: true,
  },
  estado: {
    type: String,
    enum: ['BORRADOR', 'ACTIVO', 'FINALIZADO', 'EXPORTADO_EXCEL'],
    default: 'ACTIVO',
  },
  creado_por: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  creador_nombre: {
    type: String,
    required: true,
  },
  // N:N con Usuarios (Colaboradores que han aportado al reporte)
  colaboradores: [colaboradorSchema],
  // 1:N con Novedades
  novedades: [novedadSchema],
  // Campo computado / persistido de autoría
  elaborado_por: {
    type: String,
    default: '',
  },
  observaciones_generales: {
    type: String,
    default: '',
  },
  creado_en: {
    type: Date,
    default: Date.now,
  },
  actualizado_en: {
    type: Date,
    default: Date.now,
  }
});

// Hook pre save sin callback next
reporteSchema.pre('save', function() {
  this.actualizado_en = new Date();
  if (this.colaboradores && this.colaboradores.length > 0) {
    const nombresUnicos = [...new Set(this.colaboradores.map(c => c.nombre || c.correo))];
    this.elaborado_por = nombresUnicos.join(', ');
  } else if (this.creador_nombre) {
    this.elaborado_por = this.creador_nombre;
  }
});

module.exports = mongoose.model('Reporte', reporteSchema);
