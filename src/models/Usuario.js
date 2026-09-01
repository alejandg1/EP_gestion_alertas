const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

class Usuario extends Model {
  async compararPassword(candidata) {
    return await bcrypt.compare(candidata, this.password);
  }
}

Usuario.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  correo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      esDominioInstitucional(value) {
        if (!/^[a-zA-Z0-9._%+-]+@(mail\.)?seguraep\.gob\.ec$/i.test(value)) {
          throw new Error('El correo institucional debe pertenecer al dominio @seguraep.gob.ec o @mail.seguraep.gob.ec');
        }
      }
    },
    set(value) {
      if (value) this.setDataValue('correo', value.toLowerCase().trim());
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Operador',
  },
  rol: {
    type: DataTypes.ENUM('admin', 'operador'),
    allowNull: false,
    defaultValue: 'operador',
  },
  requiere_cambio_pw: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  sequelize,
  modelName: 'Usuario',
  tableName: 'usuario',
  paranoid: true,
  hooks: {
    beforeSave: async (usuario) => {
      if (usuario.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        usuario.password = await bcrypt.hash(usuario.password, salt);
      }
      if (!usuario.nombre && usuario.correo) {
        usuario.nombre = usuario.correo.split('@')[0];
      }
    }
  }
});

module.exports = Usuario;

