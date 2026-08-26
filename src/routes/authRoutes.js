const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protegerRuta, validarScriptToken } = require('../middlewares/authMiddleware');

/**
 * @openapi
 * /api/auth/registro:
 *   post:
 *     summary: Registrar un nuevo usuario/operador
 *     tags: [Autenticación]
 *     security:
 *       - ApiKeyAuth: []
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
 *       403:
 *         description: SCRIPT_API_TOKEN inválido o ausente
 */
router.post('/registro', validarScriptToken, authController.registrar);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión y obtener JWT
 *     tags: [Autenticación]
 *     security:
 *       - ApiKeyAuth: []
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
 *       403:
 *         description: SCRIPT_API_TOKEN inválido o ausente
 */
router.post('/login', validarScriptToken, authController.login);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión activa (1:N)
 *     tags: [Autenticación]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 */
router.post('/logout', protegerRuta, authController.logout);

/**
 * @openapi
 * /api/auth/perfil:
 *   get:
 *     summary: Obtener perfil del usuario autenticado
 *     tags: [Autenticación]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario autenticado
 */
router.get('/perfil', protegerRuta, authController.perfil);

module.exports = router;
