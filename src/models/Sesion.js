const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Sesion extends Model { }

Sesion.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
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
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
  },
  ip: {
    type: DataTypes.STRING(45),
    allowNull: true,
    defaultValue: '127.0.0.1',
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ultimo_acceso: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  modelName: 'Sesion',
  tableName: 'sesion',
  paranoid: false,
});

module.exports = Sesion;

