const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Reporte extends Model {}

Reporte.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  codigo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  tipo_reporte: {
    type: DataTypes.ENUM('epoca_lluvias', 'epoca_seca'),
    allowNull: false,
    defaultValue: 'epoca_lluvias',
  },
  titulo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  numero_rds: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  fecha: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  hora_inicio: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hora_fin: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  revisado_por: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cabecera: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  periodo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  inocar_fecha: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  inocar_pleamar: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  inocar_bajamar: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  elaborado_por: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tiempo_respuesta_promedio: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  observaciones_generales: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'Reporte',
  tableName: 'reporte',
  paranoid: true,
});

module.exports = Reporte;


