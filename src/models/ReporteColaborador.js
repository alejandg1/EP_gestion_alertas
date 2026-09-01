const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class ReporteColaborador extends Model {}

ReporteColaborador.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  reporte_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'reporte',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'usuario',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  primer_aporte: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  ultimo_aporte: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  total_ediciones: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  sequelize,
  modelName: 'ReporteColaborador',
  tableName: 'reporte_colaborador',
  paranoid: false,
  indexes: [
    {
      unique: true,
      fields: ['reporte_id', 'usuario_id'],
    }
  ]
});

module.exports = ReporteColaborador;
