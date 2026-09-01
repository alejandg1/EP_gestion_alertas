const jwt = require('jsonwebtoken');
const { Sesion, Usuario } = require('../models');

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

    const sesion = await Sesion.findOne({ where: { token } });
    if (!sesion) {
      return res.status(401).json({ ok: false, mensaje: 'Sesión expirada o inválida' });
    }

    sesion.ultimo_acceso = new Date();
    await sesion.save();

    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });
    if (!usuario) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    req.usuario = usuario;
    req.sesionId = sesion.id;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, mensaje: 'Token JWT inválido o expirado', error: error.message });
  }
};

const requerirAdmin = (req, res, next) => {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({
      ok: false,
      mensaje: 'Acceso denegado: se requiere rol de administrador para realizar esta acción'
    });
  }
  next();
};

const requerirRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        ok: false,
        mensaje: `Acceso denegado: rol insuficiente. Requiere: ${rolesPermitidos.join(', ')}`
      });
    }
    next();
  };
};

module.exports = { protegerRuta, requerirAdmin, requerirRol };
