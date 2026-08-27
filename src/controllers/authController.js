const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const Usuario = require('../models/Usuario');
const Sesion = require('../models/Sesion');
const Auditoria = require('../models/Auditoria');

const generarToken = (usuario) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key';
  return jwt.sign(
    { id: usuario._id, correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol },
    secret,
    { expiresIn: '24h' }
  );
};

exports.registrar = async (req, res) => {
  try {
    const { correo, password, nombre, rol } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    logger.info(`Intento de registro recibido para correo: ${correo || 'No proporcionado'}`, { ip, body: req.body });

    if (!correo || !password) {
      logger.warn(`Registro rechazado: campos obligatorios faltantes`, { correo: !!correo, password: !!password });
      return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son obligatorios' });
    }

    const usuarioExiste = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
    if (usuarioExiste) {
      logger.warn(`Registro rechazado: el correo ya se encuentra registrado`, { correo });
      return res.status(400).json({ ok: false, mensaje: 'El correo ya está registrado' });
    }

    const nuevoUsuario = new Usuario({
      correo: correo.toLowerCase().trim(),
      password,
      nombre: nombre || correo.split('@')[0],
      rol: rol || 'operador',
    });

    await nuevoUsuario.save();

    const token = generarToken(nuevoUsuario);
    const sesion = new Sesion({
      usuario_id: nuevoUsuario._id,
      token,
      ip,
      user_agent: req.headers['user-agent'] || 'Web Client',
    });
    await sesion.save();

    await Auditoria.create({
      usuario_id: nuevoUsuario._id,
      usuario_correo: nuevoUsuario.correo,
      entidad: 'USUARIO',
      accion: 'REGISTRO',
      detalles: { correo: nuevoUsuario.correo, nombre: nuevoUsuario.nombre },
      ip,
    });

    logger.info(`Usuario registrado exitosamente: ${nuevoUsuario.correo}`, { id: nuevoUsuario._id });
    return res.status(201).json({
      ok: true,
      mensaje: 'Usuario registrado exitosamente',
      token,
      usuario: {
        id: nuevoUsuario._id,
        correo: nuevoUsuario.correo,
        nombre: nuevoUsuario.nombre,
        rol: nuevoUsuario.rol,
      }
    });
  } catch (error) {
    logger.error(`Error al registrar usuario: ${error.message}`, { stack: error.stack, body: req.body });
    return res.status(500).json({ ok: false, mensaje: 'Error al registrar usuario', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { correo, password } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    logger.info(`Intento de login recibido para: ${correo || 'No proporcionado'}`, { ip });

    if (!correo || !password) {
      logger.warn(`Login rechazado: falta correo o contraseña`);
      return res.status(400).json({ ok: false, mensaje: 'Ingrese correo y contraseña' });
    }

    const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario) {
      logger.warn(`Login fallido: usuario no registrado`, { correo });
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas (usuario no registrado)' });
    }

    const passwordValido = await usuario.compararPassword(password);
    if (!passwordValido) {
      logger.warn(`Login fallido: contraseña incorrecta`, { correo });
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas (contraseña incorrecta)' });
    }

    const token = generarToken(usuario);
    const sesion = new Sesion({
      usuario_id: usuario._id,
      token,
      ip,
      user_agent: req.headers['user-agent'] || 'Web Client',
    });
    await sesion.save();

    await Auditoria.create({
      usuario_id: usuario._id,
      usuario_correo: usuario.correo,
      entidad: 'SESION',
      accion: 'LOGIN',
      detalles: { sesion_id: sesion._id, ip },
      ip,
    });

    logger.info(`Login exitoso para: ${usuario.correo}`, { id: usuario._id });
    return res.json({
      ok: true,
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario._id,
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol,
      }
    });
  } catch (error) {
    logger.error(`Error en login: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error en el servidor al autenticar', error: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.sesionId) {
      await Sesion.findByIdAndUpdate(req.sesionId, { activo: false, ultimo_acceso: new Date() });
    }
    logger.info(`Sesión cerrada para sesión ID: ${req.sesionId}`);
    return res.json({ ok: true, mensaje: 'Sesión cerrada correctamente' });
  } catch (error) {
    logger.error(`Error al cerrar sesión: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ ok: false, mensaje: 'Error al cerrar sesión' });
  }
};


exports.perfil = async (req, res) => {
  return res.json({
    ok: true,
    usuario: req.usuario,
  });
};
