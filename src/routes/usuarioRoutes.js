const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const { protegerRuta, requerirAdmin } = require('../middlewares/authMiddleware');

// Todas las rutas de gestión de usuarios requieren autenticación y rol de Administrador
router.use(protegerRuta, requerirAdmin);

/**
 * @openapi
 * /usuarios:
 *   get:
 *     summary: Listar todos los usuarios con paginación y filtros (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Cantidad de resultados por página
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Búsqueda por coincidencia en nombre o correo
 *       - in: query
 *         name: rol
 *         schema:
 *           type: string
 *           enum: [admin, operador]
 *         description: Filtrar por rol
 *       - in: query
 *         name: incluirEliminados
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Incluir usuarios desactivados (soft-deleted)
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida exitosamente
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.get('/', usuarioController.listar);

/**
 * @openapi
 * /usuarios/{id}:
 *   get:
 *     summary: Obtener información detallada de un usuario por ID (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID numérico del usuario
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/:id', usuarioController.obtenerPorId);

/**
 * @openapi
 * /usuarios:
 *   post:
 *     summary: Crear un nuevo usuario (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - correo
 *               - password
 *             properties:
 *               correo:
 *                 type: string
 *                 example: operador1@seguraep.gob.ec
 *               password:
 *                 type: string
 *                 example: Clave123*
 *               nombre:
 *                 type: string
 *                 example: Juan Pérez
 *               rol:
 *                 type: string
 *                 enum: [admin, operador]
 *                 default: operador
 *               requiere_cambio_pw:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *       400:
 *         description: Datos inválidos o correo duplicado
 */
router.post('/', usuarioController.crear);

/**
 * @openapi
 * /usuarios/{id}:
 *   put:
 *     summary: Actualizar datos de un usuario (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Juan Carlos Pérez
 *               rol:
 *                 type: string
 *                 enum: [admin, operador]
 *               correo:
 *                 type: string
 *                 example: jc.perez@seguraep.gob.ec
 *               requiere_cambio_pw:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Usuario actualizado exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Usuario no encontrado
 */
router.put('/:id', usuarioController.actualizar);

/**
 * @openapi
 * /usuarios/{id}/password:
 *   patch:
 *     summary: Restablecer contraseña de un usuario (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 example: NuevaClaveSegura2026*
 *               requiere_cambio_pw:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Contraseña restablecida exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Usuario no encontrado
 */
router.patch('/:id/password', usuarioController.cambiarPassword);

/**
 * @openapi
 * /usuarios/{id}:
 *   delete:
 *     summary: Desactivar usuario - Eliminación Lógica (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID numérico del usuario a desactivar
 *     responses:
 *       200:
 *         description: Usuario desactivado exitosamente (eliminación lógica)
 *       400:
 *         description: No se puede desactivar la propia cuenta
 *       404:
 *         description: Usuario no encontrado o ya desactivado
 */
router.delete('/:id', usuarioController.eliminar);

/**
 * @openapi
 * /usuarios/{id}/restaurar:
 *   post:
 *     summary: Restaurar / Reactivar un usuario desactivado lógicamente (Solo Admin)
 *     tags: [Usuarios]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario a restaurar
 *     responses:
 *       200:
 *         description: Usuario restaurado exitosamente
 *       400:
 *         description: El usuario ya se encuentra activo
 *       404:
 *         description: Usuario no encontrado
 */
router.post('/:id/restaurar', usuarioController.restaurar);

module.exports = router;
