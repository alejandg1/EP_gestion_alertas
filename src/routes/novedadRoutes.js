const express = require('express');
const router = express.Router();
const novedadController = require('../controllers/novedadController');
const { protegerRuta } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

/**
 * @openapi
 * /novedades/metricas-tiempos:
 *   get:
 *     summary: Obtener analítica global y KPIs de tiempos de respuesta y personal por institución
 *     tags: [Novedades]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fechaDesde
 *         schema:
 *           type: string
 *         description: Fecha inicio (YYYY-MM-DD)
 *       - in: query
 *         name: fechaHasta
 *         schema:
 *           type: string
 *         description: Fecha fin (YYYY-MM-DD)
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *         description: Filtrar por tipo de evento (AGUA, ARBOL, SINIESTRO, etc.)
 *       - in: query
 *         name: aga
 *         schema:
 *           type: string
 *         description: Filtrar por sector AGA (ej. A02, A09)
 *       - in: query
 *         name: reporte_id
 *         schema:
 *           type: integer
 *         description: ID de reporte específico
 *     responses:
 *       200:
 *         description: Métricas agregadas de tiempos de respuesta y desglose institucional
 */
router.get('/metricas-tiempos', protegerRuta, novedadController.obtenerMetricasTiempos);

/**
 * @openapi
 * /novedades:
 *   get:
 *     summary: Listar todas las novedades registradas con paginación y filtros
 *     tags: [Novedades]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página para paginación
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Cantidad de registros por página
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [AGUA, ARBOL, DESLIZAMIENTO, POSTE, SINIESTRO, INUNDACION, VENDAVAL, AFECTACION]
 *         description: Filtrar por tipo de novedad
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [PENDIENTE, EN_SITIO, EN_ATENCION, SOLUCIONADO]
 *         description: Filtrar por estado operativo
 *       - in: query
 *         name: busqueda
 *         schema:
 *           type: string
 *         description: Búsqueda de texto en dirección, descripción, AGA o recurso
 *       - in: query
 *         name: fechaDesde
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicio (YYYY-MM-DD)
 *       - in: query
 *         name: fechaHasta
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha fin (YYYY-MM-DD)
 *       - in: query
 *         name: soloHistoricos
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Si es true, retorna novedades sin reporte asociado (históricos)
 *     responses:
 *       200:
 *         description: Lista o página de novedades obtenida exitosamente
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error interno del servidor
 *   post:
 *     summary: Crear una novedad independiente o asociada a un reporte con soporte de fotos
 *     tags: [Novedades]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgregarNovedad'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [AGUA, ARBOL, DESLIZAMIENTO, POSTE, SINIESTRO, INUNDACION, VENDAVAL, AFECTACION]
 *                 example: AGUA
 *               direccion:
 *                 type: string
 *                 example: Av. 9 de Octubre y Boyacá
 *               aga:
 *                 type: string
 *                 example: A09
 *               instituciones:
 *                 type: string
 *                 example: '@emapagye @interagua'
 *               fecha:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-08-25T16:40:00Z
 *               latitud:
 *                 type: number
 *                 example: -2.1894
 *               longitud:
 *                 type: number
 *                 example: -79.8891
 *               recurso:
 *                 type: string
 *                 example: INS-ALC
 *               estado:
 *                 type: string
 *                 enum: [PENDIENTE, EN_SITIO, EN_ATENCION, SOLUCIONADO]
 *                 example: PENDIENTE
 *               descripcion:
 *                 type: string
 *                 example: Acumulación de agua por lluvias
 *               acciones:
 *                 type: string
 *                 example: Cuadrilla despachada
 *               hora_sitio:
 *                 type: string
 *                 example: '17:10'
 *               solucionado:
 *                 type: string
 *                 example: '18:30'
 *               reporte_id:
 *                 type: integer
 *                 example: 1
 *               datos_adicionales:
 *                 type: string
 *                 description: Cadena JSON o JSON object de datos adicionales
 *                 example: '{"ficha":"FICHA-2026-001"}'
 *               recursos_instituciones:
 *                 type: string
 *                 description: Objeto o cadena JSON con conteo de vehículos
 *                 example: '{"BCBG":1}'
 *               personal_instituciones:
 *                 type: string
 *                 description: Objeto o cadena JSON con conteo de personal
 *                 example: '{"BCBG":3}'
 *               fotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Archivos fotográficos (máximo 2 imágenes, máx 5MB c/u)
 *     responses:
 *       201:
 *         description: Novedad creada exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', protegerRuta, novedadController.listarNovedades);
router.post('/', protegerRuta, upload.array('fotos', 2), novedadController.crearNovedad);

/**
 * @openapi
 * /novedades/{id}:
 *   get:
 *     summary: Obtener el detalle completo de una novedad por su ID
 *     tags: [Novedades]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID numérico de la novedad
 *     responses:
 *       200:
 *         description: Novedad encontrada con éxito
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Novedad no encontrada
 *       500:
 *         description: Error interno del servidor
 *   put:
 *     summary: Actualizar una novedad existente por su ID (recálculo de tiempos y colaboración)
 *     tags: [Novedades]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID numérico de la novedad a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarNovedad'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [AGUA, ARBOL, DESLIZAMIENTO, POSTE, SINIESTRO, INUNDACION, VENDAVAL, AFECTACION]
 *               direccion:
 *                 type: string
 *               aga:
 *                 type: string
 *               instituciones:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date-time
 *               latitud:
 *                 type: number
 *               longitud:
 *                 type: number
 *               recurso:
 *                 type: string
 *               estado:
 *                 type: string
 *                 enum: [PENDIENTE, EN_SITIO, EN_ATENCION, SOLUCIONADO]
 *               descripcion:
 *                 type: string
 *               acciones:
 *                 type: string
 *               hora_sitio:
 *                 type: string
 *               solucionado:
 *                 type: string
 *               reporte_id:
 *                 type: integer
 *               datos_adicionales:
 *                 type: string
 *               recursos_instituciones:
 *                 type: string
 *               personal_instituciones:
 *                 type: string
 *               fotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Novedad actualizada exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Novedad no encontrada
 *       500:
 *         description: Error interno del servidor
 *   delete:
 *     summary: Eliminar una novedad por su ID (eliminación lógica - soft delete)
 *     tags: [Novedades]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID numérico de la novedad a eliminar
 *     responses:
 *       200:
 *         description: Novedad eliminada exitosamente
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Novedad no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.get('/:id', protegerRuta, novedadController.obtenerNovedad);
router.put('/:id', protegerRuta, upload.array('fotos', 2), novedadController.actualizarNovedad);
router.delete('/:id', protegerRuta, novedadController.eliminarNovedad);

module.exports = router;
