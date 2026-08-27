const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protegerRuta, requerirAdmin } = require('../middlewares/authMiddleware');

/**
 * @openapi
 * /auth/registro:
 *   post:
 *     summary: Registrar un nuevo usuario/operador (Solo Administradores)
 *     tags: [Autenticacion]
 *     security:
 *       - BearerAuth: []
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
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.post('/registro', protegerRuta, requerirAdmin, authController.registrar);


/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión y obtener JWT
 *     tags: [Autenticacion]
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
 *     tags: [Autenticacion]
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
 *     tags: [Autenticacion]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario autenticado
 */
router.get('/perfil', protegerRuta, authController.perfil);

/**
 * @openapi
 * /auth/chpass:
 *   post:
 *     summary: Cambiar contraseña (propia o de otro usuario si es Admin)
 *     tags: [Autenticacion]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Obligatorio solo si el usuario cambia su propia contraseña
 *               newPassword:
 *                 type: string
 *                 description: Nueva contraseña
 *               usuarioId:
 *                 type: string
 *                 description: ID del usuario a modificar (solo administradores)
 *     responses:
 *       200:
 *         description: Contraseña cambiada exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: Contraseña actual incorrecta o token inválido
 */
router.post('/chpass', protegerRuta, authController.chpass);

module.exports = router;

