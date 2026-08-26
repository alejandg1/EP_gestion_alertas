const jwt = require('jsonwebtoken');
const Sesion = require('../models/Sesion');
const Usuario = require('../models/Usuario');

const protegerRuta = async (req, res, next) => {
  try {
    const scriptTokenHeader = req.headers['x-api-token'] || req.query.api_token;
    const requiredScriptToken = (process.env.SCRIPT_API_TOKEN || '').trim();

    if (requiredScriptToken) {
      if (!scriptTokenHeader || scriptTokenHeader.trim() !== requiredScriptToken) {
        return res.status(403).json({
          ok: false,
          mensaje: 'Acceso denegado: Token de sistema (SCRIPT_API_TOKEN) ausente o inválido'
        });
      }
    }

    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ ok: false, mensaje: 'Acceso no autorizado: falta token de usuario' });
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
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado', error: error.message });
  }
};

const validarScriptToken = (req, res, next) => {
  const scriptTokenHeader = req.headers['x-api-token'] || req.query.api_token;
  const requiredScriptToken = (process.env.SCRIPT_API_TOKEN || '').trim();

  if (requiredScriptToken) {
    if (!scriptTokenHeader || scriptTokenHeader.trim() !== requiredScriptToken) {
      return res.status(403).json({
        ok: false,
        mensaje: 'Acceso denegado: Token de sistema (SCRIPT_API_TOKEN) ausente o inválido'
      });
    }
  }
  next();
};

module.exports = { protegerRuta, validarScriptToken };