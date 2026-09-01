const { sequelize } = require('../config/database');
const Usuario = require('./Usuario');
const Reporte = require('./Reporte');
const ReporteColaborador = require('./ReporteColaborador');
const Novedad = require('./Novedad');
const NovedadFoto = require('./NovedadFoto');
const Sesion = require('./Sesion');
const Auditoria = require('./Auditoria');

Usuario.hasMany(Sesion, { foreignKey: 'usuario_id', as: 'sesiones', onDelete: 'CASCADE' });
Sesion.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

Usuario.hasMany(Novedad, { foreignKey: 'usuario_id', as: 'novedades', onDelete: 'RESTRICT' });
Novedad.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

Reporte.hasMany(Novedad, { foreignKey: 'reporte_id', as: 'novedades', onDelete: 'SET NULL' });
Novedad.belongsTo(Reporte, { foreignKey: 'reporte_id', as: 'reporte' });

Novedad.hasMany(NovedadFoto, { foreignKey: 'novedad_id', as: 'fotos', onDelete: 'CASCADE' });
NovedadFoto.belongsTo(Novedad, { foreignKey: 'novedad_id', as: 'novedad' });

Usuario.hasMany(Auditoria, { foreignKey: 'usuario_id', as: 'auditorias', onDelete: 'SET NULL' });
Auditoria.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

Reporte.belongsToMany(Usuario, { through: ReporteColaborador, foreignKey: 'reporte_id', otherKey: 'usuario_id', as: 'colaboradores' });
Usuario.belongsToMany(Reporte, { through: ReporteColaborador, foreignKey: 'usuario_id', otherKey: 'reporte_id', as: 'reportes' });

Reporte.hasMany(ReporteColaborador, { foreignKey: 'reporte_id', as: 'reporte_colaboradores', onDelete: 'CASCADE' });
ReporteColaborador.belongsTo(Reporte, { foreignKey: 'reporte_id', as: 'reporte' });

Usuario.hasMany(ReporteColaborador, { foreignKey: 'usuario_id', as: 'reporte_colaboraciones', onDelete: 'CASCADE' });
ReporteColaborador.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

module.exports = {
  sequelize,
  Usuario,
  Reporte,
  ReporteColaborador,
  Novedad,
  NovedadFoto,
  Sesion,
  Auditoria,
};
