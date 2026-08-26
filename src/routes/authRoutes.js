const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protegerRuta } = require('../middlewares/authMiddleware');

/**
 * @openapi
 * /auth/registro:
 *   post:
 *     summary: Registrar un nuevo usuario/operador
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegistroUsuario'
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *       400:
 *         description: Datos inválidos o correo ya registrado
 */
router.post('/registro', authController.registrar);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión y obtener JWT
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginUsuario'
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso (devuelve token JWT)
 *       401:
 *         description: Credenciales incorrectas
 */
router.post('/login', authController.login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Cerrar sesión activa (1:N)
 *     tags: [Autenticación]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 */
router.post('/logout', protegerRuta, authController.logout);

/**
 * @openapi
 * /auth/perfil:
 *   get:
 *     summary: Obtener perfil del usuario autenticado
 *     tags: [Autenticación]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario autenticado
 */
router.get('/perfil', protegerRuta, authController.perfil);

module.exports = router;
