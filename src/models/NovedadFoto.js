const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class NovedadFoto extends Model { }

NovedadFoto.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  novedad_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'novedad',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  url_foto: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nombre_archivo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'NovedadFoto',
  tableName: 'novedad_foto',
  paranoid: false,
  updatedAt: false,
});

module.exports = NovedadFoto;
