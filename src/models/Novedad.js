const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { calcularTiemposNovedad, calcularRecursosYPersonal, obtenerHoraActualHHMM, obtenerTimestampISO } = require('../services/calculosOperativosService');

class Novedad extends Model { }

// Limpiador de emojis para cadenas de texto
function limpiarEmojis(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '')
    .trim();
}

// Normalizador canónico de estados operativos
function normalizarEstado(estadoStr) {
  if (!estadoStr) return 'PENDIENTE';
  const limpio = limpiarEmojis(estadoStr)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  if (limpio.includes('SITIO')) return 'EN_SITIO';
  if (limpio.includes('SOLUCION') || limpio.includes('ATENDIDO') || limpio.includes('FINALIZ')) return 'SOLUCIONADO';
  if (limpio.includes('ATENCION') || limpio.includes('CURSO') || limpio.includes('PROCESO')) return 'EN_ATENCION';
  return 'PENDIENTE';
}

Novedad.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  reporte_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'reporte',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'usuario',
      key: 'id',
    },
    onDelete: 'RESTRICT',
  },
  tipo: {
    type: DataTypes.ENUM(
      'AGUA',
      'ARBOL',
      'DESLIZAMIENTO',
      'POSTE',
      'SINIESTRO',
      'INUNDACION',
      'VENDAVAL',
      'AFECTACION',
    ),
    allowNull: false,
    defaultValue: 'AGUA',
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  aga: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'A09',
  },
  instituciones: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '@emapagye @interagua',
  },
  fecha: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  latitud: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitud: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  recurso: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  estado: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'PENDIENTE',
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  acciones: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  hora_sitio: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tiempo_respuesta: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  solucionado: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tiempo_atencion: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  datos_adicionales: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'Novedad',
  tableName: 'novedad',
  paranoid: true,
  hooks: {
    beforeSave: async (novedad) => {
      // Normalización canónica interna (detecta tanto con emoji como texto plano: "📍EN SITIO", "EN_SITIO", "✅ATENDIDO", "SOLUCIONADO", etc.)
      const estadoCanonico = normalizarEstado(novedad.estado);

      // Transición de estados con timestamps automáticos (formato ISO completo para soportar cálculo entre múltiples días):
      // EN_SITIO -> Asigna hora_sitio automáticamente si no fue ingresada manualmente
      if (estadoCanonico === 'EN_SITIO') {
        if (!novedad.hora_sitio || String(novedad.hora_sitio).trim() === '') {
          novedad.hora_sitio = obtenerTimestampISO();
        }
      } 
      // SOLUCIONADO -> Asigna solucionado automáticamente si no fue ingresada manualmente
      else if (estadoCanonico === 'SOLUCIONADO') {
        if (!novedad.solucionado || String(novedad.solucionado).trim() === '') {
          novedad.solucionado = obtenerTimestampISO();
        }
      }
      // PENDIENTE y EN_ATENCION no disparan timestamps automáticos

      // 1. Cálculo automático de tiempos (tiempo_respuesta y tiempo_atencion)
      const tiempos = calcularTiemposNovedad({
        fecha: novedad.fecha,
        hora_sitio: novedad.hora_sitio,
        solucionado: novedad.solucionado,
      });

      if (tiempos.tiempo_respuesta !== null) {
        novedad.tiempo_respuesta = tiempos.tiempo_respuesta;
      }
      if (tiempos.tiempo_atencion !== null) {
        novedad.tiempo_atencion = tiempos.tiempo_atencion;
      }

      // 2. Si vienen recursos o personal en datos_adicionales, procesar desglose respetando valores manuales
      if (novedad.datos_adicionales && (novedad.datos_adicionales.recursos || novedad.datos_adicionales.personal)) {
        const desglose = calcularRecursosYPersonal(
          novedad.datos_adicionales.recursos || {},
          novedad.datos_adicionales.personal || {}
        );
        novedad.set('datos_adicionales', {
          ...novedad.datos_adicionales,
          recursos: desglose.recursos,
          personal: desglose.personal,
          total_recursos: desglose.total_recursos,
          total_personal: desglose.total_personal,
        });
        novedad.changed('datos_adicionales', true);

        if (desglose.instituciones_intervinientes.length > 0 && !novedad.instituciones) {
          novedad.instituciones = desglose.instituciones_intervinientes.map(i => `@${i.toLowerCase().replace(/\s+/g, '')}`).join(' ');
        }
      }
    }
  }
});

module.exports = Novedad;
