const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Novedad extends Model {}

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
    type: DataTypes.ENUM('AGUA', 'ARBOL', 'DESLIZAMIENTO', 'POSTE', 'SINIESTRO', 'INUNDACION', 'VENDAVAL', 'AFECTACION', 'OTRO'),
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
  datos_adicionales: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'Novedad',
  tableName: 'novedad',
  paranoid: true,
});

module.exports = Novedad;
