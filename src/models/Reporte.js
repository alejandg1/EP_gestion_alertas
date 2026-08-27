const mongoose = require('mongoose');

// Subesquema de Novedad (1:N con Reporte, vinculada directamente al Usuario creador)
const novedadSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: [true, 'El ID de usuario es obligatorio para cada novedad'],
  },
  usuario_nombre: {
    type: String,
    required: [true, 'El nombre de usuario es obligatorio para cada novedad'],
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
  recurso_asignado: {
    type: String,
    default: 'INS-ALC 🚙',
  },
  estado_operativo: {
    type: String,
    default: '⛔PENDIENTE',
  },
  descripcion: {
    type: String,
    default: '',
  },
  acciones_inmediatas: {
    type: String,
    default: '',
  },
  fotos: [{
    type: String, // Rutas o URLs de las fotografías almacenadas en el servidor
  }],
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
  numero_rds: {
    type: String,
    default: 'SEGURA-EP-GASGEC-SS-2026-041 (Lluvias)',
    trim: true,
  },
  fecha_reporte: {
    type: String,
    default: () => new Date().toISOString().split('T')[0],
  },
  hora_inicio: {
    type: String,
    default: '06:00',
  },
  hora_fin: {
    type: String,
    default: '22:00',
  },
  revisado_por: {
    type: String,
    default: 'Jefe de Sala Situacional | MSc. Ing. Santiago Jaramillo',
    trim: true,
  },
  cabecera: {
    type: String,
    default: 'REPORTE DE NOVEDADES POR LLUVIAS INICIAL: 07/05/2026 21h30',
    trim: true,
  },
  periodo: {
    type: String,
    default: 'Durante la noche del 7 de mayo se han registrado las siguientes novedades en el cantón Guayaquil por efecto de las lluvias:',
    trim: true,
  },
  inocar_fecha: {
    type: String,
    default: '7 de mayo',
    trim: true,
  },
  inocar_pleamar: {
    type: String,
    default: 'a las 22h42 con 4.13m',
    trim: true,
  },
  inocar_bajamar: {
    type: String,
    default: 'a las 05h27 del 08/05/2026 con 0.79m',
    trim: true,
  },
  colaboradores: [colaboradorSchema],
  novedades: [novedadSchema],
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

reporteSchema.index({ fecha_reporte: -1, actualizado_en: -1 });
reporteSchema.index({ numero_rds: 1 });
reporteSchema.index({ estado: 1, fecha_reporte: -1 });

reporteSchema.pre('save', function () {

  this.actualizado_en = new Date();

  if (this.novedades && this.novedades.length > 0) {
    const autoresNovedades = [...new Set(
      this.novedades
        .map(n => n.usuario_nombre)
        .filter(Boolean)
    )];
    if (autoresNovedades.length > 0) {
      this.elaborado_por = autoresNovedades.join(' – ');
    }
  } else if (this.colaboradores && this.colaboradores.length > 0) {
    const nombresUnicos = [...new Set(this.colaboradores.map(c => c.nombre || c.correo))];
    this.elaborado_por = nombresUnicos.join(' – ');
  } else {
    this.elaborado_por = '';
  }
});

module.exports = mongoose.model('Reporte', reporteSchema);
