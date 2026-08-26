const jwt = require('jsonwebtoken');
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
    console.log('[AUTH] Petición recibida en /auth/registro:', req.body?.correo);
    const { correo, password, nombre } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    if (!correo || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son obligatorios' });
    }

    const usuarioExiste = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
    if (usuarioExiste) {
      return res.status(400).json({ ok: false, mensaje: 'El correo ya está registrado' });
    }

    const nuevoUsuario = new Usuario({
      correo: correo.toLowerCase().trim(),
      password,
      nombre: nombre || correo.split('@')[0],
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

    console.log('[AUTH] Usuario registrado exitosamente:', nuevoUsuario.correo);
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
    console.error('Error en registro:', error);
    return res.status(500).json({ ok: false, mensaje: 'Error al registrar usuario', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('[AUTH] Petición recibida en /auth/login:', req.body?.correo);
    const { correo, password } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    if (!correo || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Ingrese correo y contraseña' });
    }

    const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario) {
      console.log('[AUTH] Usuario no encontrado:', correo);
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas (usuario no registrado)' });
    }

    const passwordValido = await usuario.compararPassword(password);
    if (!passwordValido) {
      console.log('[AUTH] Contraseña incorrecta para:', correo);
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

    console.log('[AUTH] Login exitoso para:', usuario.correo);
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
    console.error('Error en login:', error);
    return res.status(500).json({ ok: false, mensaje: 'Error en el servidor al autenticar', error: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.sesionId) {
      await Sesion.findByIdAndUpdate(req.sesionId, { activo: false, ultimo_acceso: new Date() });
    }
    return res.json({ ok: true, mensaje: 'Sesión cerrada correctamente' });
  } catch (error) {
    return res.status(500).json({ ok: false, mensaje: 'Error al cerrar sesión' });
  }
};

exports.perfil = async (req, res) => {
  return res.json({
    ok: true,
    usuario: req.usuario,
  });
};
