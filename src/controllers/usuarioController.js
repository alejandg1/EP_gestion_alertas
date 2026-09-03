const { Op } = require('sequelize');
const logger = require('../config/logger');
const { sequelize, Usuario, Sesion, Auditoria } = require('../models');

/**
 * Listar usuarios con paginación, búsqueda y filtros
 */
exports.listar = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { search, rol, incluirEliminados } = req.query;

    const where = {};

    if (rol && ['admin', 'operador'].includes(rol)) {
      where.rol = rol;
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      where[Op.or] = [
        { nombre: { [Op.iLike]: searchTerm } },
        { correo: { [Op.iLike]: searchTerm } },
      ];
    }

    const { count, rows: usuarios } = await Usuario.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['id', 'ASC']],
      limit,
      offset,
      paranoid: incluirEliminados === 'true' ? false : true,
    });

    return res.json({
      ok: true,
      total: count,
      pagina: page,
      totalPaginas: Math.ceil(count / limit) || 1,
      limite: limit,
      usuarios,
    });
  } catch (error) {
    logger.error(`Error al listar usuarios: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al listar usuarios', error: error.message });
  }
};

/**
 * Obtener un usuario por su ID
 */
exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await Usuario.findByPk(id, {
      attributes: { exclude: ['password'] },
    });

    if (!usuario) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    return res.json({ ok: true, usuario });
  } catch (error) {
    logger.error(`Error al obtener usuario ${req.params.id}: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener usuario', error: error.message });
  }
};

/**
 * Crear un nuevo usuario (Gestión Administrativa)
 */
exports.crear = async (req, res) => {
  const { correo, password, nombre, rol, requiere_cambio_pw } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const solicitante = req.usuario;

  if (!correo || !password) {
    return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son obligatorios' });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const correoNormalizado = correo.toLowerCase().trim();
  const esDominioValido = correoNormalizado.endsWith('@seguraep.gob.ec') || correoNormalizado.endsWith('@mail.seguraep.gob.ec');
  if (!esDominioValido) {
    return res.status(400).json({
      ok: false,
      mensaje: 'El correo debe pertenecer al dominio institucional (@seguraep.gob.ec o @mail.seguraep.gob.ec)'
    });
  }

  const rolAsignado = rol && ['admin', 'operador'].includes(rol) ? rol : 'operador';

  const t = await sequelize.transaction();

  try {
    const usuarioExiste = await Usuario.findOne({ where: { correo: correoNormalizado }, paranoid: false, transaction: t });
    if (usuarioExiste) {
      await t.rollback();
      return res.status(400).json({ ok: false, mensaje: 'Ya existe un usuario con este correo electrónico' });
    }

    const nuevoUsuario = await Usuario.create({
      correo: correoNormalizado,
      password,
      nombre: nombre || correoNormalizado.split('@')[0],
      rol: rolAsignado,
      requiere_cambio_pw: !!requiere_cambio_pw,
    }, { transaction: t });

    await Auditoria.create({
      usuario_id: solicitante?.id,
      accion: 'CREAR',
      tabla_afectada: 'usuario',
      registro_id: nuevoUsuario.id,
      detalles: {
        correo: nuevoUsuario.correo,
        nombre: nuevoUsuario.nombre,
        rol: nuevoUsuario.rol,
        creado_por: solicitante?.correo || 'admin',
      },
      ip,
    }, { transaction: t });

    await t.commit();

    logger.info(`Usuario creado por administración: ${nuevoUsuario.correo} (ID: ${nuevoUsuario.id}) por ${solicitante?.correo}`);

    return res.status(201).json({
      ok: true,
      mensaje: 'Usuario creado exitosamente',
      usuario: {
        id: nuevoUsuario.id,
        correo: nuevoUsuario.correo,
        nombre: nuevoUsuario.nombre,
        rol: nuevoUsuario.rol,
        requiere_cambio_pw: nuevoUsuario.requiere_cambio_pw,
        createdAt: nuevoUsuario.createdAt,
      }
    });
  } catch (error) {
    await t.rollback();
    logger.error(`Error al crear usuario: ${error.message}`, { stack: error.stack, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al crear usuario', error: error.message });
  }
};

/**
 * Actualizar datos de un usuario existente
 */
exports.actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre, rol, correo, requiere_cambio_pw } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const solicitante = req.usuario;

  const t = await sequelize.transaction();

  try {
    const usuario = await Usuario.findByPk(id, { transaction: t });
    if (!usuario) {
      await t.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    const cambios = {};

    if (nombre !== undefined && nombre.trim()) {
      cambios.nombre = nombre.trim();
    }

    if (rol !== undefined && ['admin', 'operador'].includes(rol)) {
      cambios.rol = rol;
    }

    if (requiere_cambio_pw !== undefined) {
      cambios.requiere_cambio_pw = !!requiere_cambio_pw;
    }

    if (correo !== undefined && correo.trim()) {
      const correoNormalizado = correo.toLowerCase().trim();
      const esDominioValido = correoNormalizado.endsWith('@seguraep.gob.ec') || correoNormalizado.endsWith('@mail.seguraep.gob.ec');
      if (!esDominioValido) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          mensaje: 'El correo debe pertenecer al dominio institucional (@seguraep.gob.ec o @mail.seguraep.gob.ec)'
        });
      }

      if (correoNormalizado !== usuario.correo) {
        const correoEnUso = await Usuario.findOne({
          where: { correo: correoNormalizado, id: { [Op.ne]: usuario.id } },
          paranoid: false,
          transaction: t
        });

        if (correoEnUso) {
          await t.rollback();
          return res.status(400).json({ ok: false, mensaje: 'El nuevo correo ya está registrado por otro usuario' });
        }
        cambios.correo = correoNormalizado;
      }
    }

    await usuario.update(cambios, { transaction: t });

    await Auditoria.create({
      usuario_id: solicitante?.id,
      accion: 'EDITAR',
      tabla_afectada: 'usuario',
      registro_id: usuario.id,
      detalles: {
        cambios,
        modificado_por: solicitante?.correo || 'admin',
      },
      ip,
    }, { transaction: t });

    await t.commit();

    logger.info(`Usuario actualizado: ${usuario.correo} (ID: ${usuario.id}) por ${solicitante?.correo}`);

    return res.json({
      ok: true,
      mensaje: 'Usuario actualizado exitosamente',
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol,
        requiere_cambio_pw: usuario.requiere_cambio_pw,
        updatedAt: usuario.updatedAt,
      }
    });
  } catch (error) {
    await t.rollback();
    logger.error(`Error al actualizar usuario ${id}: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar usuario', error: error.message });
  }
};

/**
 * Restablecer contraseña de un usuario por administrador
 */
exports.cambiarPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword, requiere_cambio_pw } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const solicitante = req.usuario;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      ok: false,
      mensaje: 'La nueva contraseña es obligatoria y debe tener al menos 6 caracteres'
    });
  }

  const t = await sequelize.transaction();

  try {
    const usuario = await Usuario.findByPk(id, { transaction: t });
    if (!usuario) {
      await t.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    usuario.password = newPassword;
    usuario.requiere_cambio_pw = requiere_cambio_pw !== undefined ? !!requiere_cambio_pw : false;
    await usuario.save({ transaction: t });

    // Invalidar sesiones activas del usuario por seguridad
    await Sesion.destroy({ where: { usuario_id: usuario.id }, transaction: t });

    await Auditoria.create({
      usuario_id: solicitante?.id,
      accion: 'CAMBIO_PASSWORD',
      tabla_afectada: 'usuario',
      registro_id: usuario.id,
      detalles: {
        usuario_afectado: usuario.correo,
        restablecido_por: solicitante?.correo || 'admin',
        ip,
      },
      ip,
    }, { transaction: t });

    await t.commit();

    logger.info(`Contraseña restablecida para usuario ${usuario.correo} (ID: ${usuario.id}) por ${solicitante?.correo}`);

    return res.json({
      ok: true,
      mensaje: `Contraseña restablecida exitosamente para el usuario ${usuario.correo}`
    });
  } catch (error) {
    await t.rollback();
    logger.error(`Error al restablecer contraseña del usuario ${id}: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al restablecer contraseña', error: error.message });
  }
};

exports.eliminar = async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const solicitante = req.usuario;

  if (solicitante && Number(solicitante.id) === Number(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: 'No puedes desactivar tu propia cuenta de administrador'
    });
  }

  const t = await sequelize.transaction();

  try {
    const usuario = await Usuario.findByPk(id, { transaction: t });
    if (!usuario) {
      await t.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado o ya desactivado' });
    }

    await Sesion.destroy({ where: { usuario_id: usuario.id }, transaction: t });

    await usuario.destroy({ transaction: t });

    await Auditoria.create({
      usuario_id: solicitante?.id,
      accion: 'ELIMINAR',
      tabla_afectada: 'usuario',
      registro_id: Number(id),
      detalles: {
        correo: usuario.correo,
        nombre: usuario.nombre,
        desactivado_por: solicitante?.correo || 'admin',
        tipo_eliminacion: 'logica',
      },
      ip,
    }, { transaction: t });

    await t.commit();

    logger.info(`Usuario desactivado (lógico): ${usuario.correo} (ID: ${id}) por ${solicitante?.correo}`);

    return res.json({
      ok: true,
      mensaje: `Usuario ${usuario.correo} desactivado exitosamente`
    });
  } catch (error) {
    await t.rollback();
    logger.error(`Error al desactivar usuario ${id}: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al desactivar usuario', error: error.message });
  }
};

/**
 * Restaurar usuario desactivado lógicamente
 */
exports.restaurar = async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const solicitante = req.usuario;

  const t = await sequelize.transaction();

  try {
    const usuario = await Usuario.findByPk(id, { paranoid: false, transaction: t });
    if (!usuario) {
      await t.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    if (!usuario.deletedAt) {
      await t.rollback();
      return res.status(400).json({ ok: false, mensaje: 'El usuario ya se encuentra activo' });
    }

    await usuario.restore({ transaction: t });

    await Auditoria.create({
      usuario_id: solicitante?.id,
      accion: 'EDITAR',
      tabla_afectada: 'usuario',
      registro_id: Number(id),
      detalles: {
        accion_detalle: 'RESTAURAR_USUARIO',
        correo: usuario.correo,
        nombre: usuario.nombre,
        restaurado_por: solicitante?.correo || 'admin',
      },
      ip,
    }, { transaction: t });

    await t.commit();

    logger.info(`Usuario reactivado: ${usuario.correo} (ID: ${id}) por ${solicitante?.correo}`);

    return res.json({
      ok: true,
      mensaje: `Usuario ${usuario.correo} restaurado y reactivado exitosamente`,
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol,
      }
    });
  } catch (error) {
    await t.rollback();
    logger.error(`Error al restaurar usuario ${id}: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al restaurar usuario', error: error.message });
  }
};
