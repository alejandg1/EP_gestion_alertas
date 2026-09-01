const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Auditoria extends Model { }

Auditoria.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'usuario',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },
  accion: {
    type: DataTypes.ENUM('LOGIN', 'REGISTRO', 'LOGOUT', 'CREAR', 'EDITAR', 'ELIMINAR', 'CAMBIO_PASSWORD'),
    allowNull: false,
  },
  tabla_afectada: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  registro_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  detalles: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  ip: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'Auditoria',
  tableName: 'auditoria',
  paranoid: false,
  updatedAt: false,
});

module.exports = Auditoria;

