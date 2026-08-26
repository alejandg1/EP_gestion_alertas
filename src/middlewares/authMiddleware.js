const jwt = require('jsonwebtoken');
const Sesion = require('../models/Sesion');
const Usuario = require('../models/Usuario');

const protegerRuta = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ ok: false, mensaje: 'Acceso no autorizado: falta token JWT de usuario' });
    }

    const secret = (process.env.JWT_SECRET || 'fallback_secret_key').trim();
    const decoded = jwt.verify(token, secret);

    const sesion = await Sesion.findOne({ token, activo: true });
    if (!sesion) {
      return res.status(401).json({ ok: false, mensaje: 'Sesión expirada o inválida' });
    }

    sesion.ultimo_acceso = new Date();
    await sesion.save();

    const usuario = await Usuario.findById(decoded.id).select('-password');
    if (!usuario) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    req.usuario = usuario;
    req.sesionId = sesion._id;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, mensaje: 'Token JWT inválido o expirado', error: error.message });
  }
};

module.exports = { protegerRuta };