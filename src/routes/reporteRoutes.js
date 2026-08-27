const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporteController');
const { protegerRuta } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

/**
 * @openapi
 * /reportes:
 *   get:
 *     summary: Listar reportes (Paginación opcional, filtros de búsqueda y fechas)
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página (opcional, ej. 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Cantidad de registros por página (opcional, ej. 15)
 *       - in: query
 *         name: busqueda
 *         schema:
 *           type: string
 *         description: Búsqueda por número RDS, título o elaborado por
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [BORRADOR, ACTIVO, FINALIZADO, EXPORTADO_EXCEL]
 *         description: Filtrar por estado del reporte
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
 *     responses:
 *       200:
 *         description: Lista o página de reportes

 *   post:
 *     summary: Crear un nuevo reporte
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearReporte'
 *     responses:
 *       201:
 *         description: Reporte creado exitosamente
 */
router.get('/', protegerRuta, reporteController.listarReportes);
router.post('/', protegerRuta, reporteController.crearReporte);

/**
 * @openapi
 * /reportes/upload-foto:
 *   post:
 *     summary: Subir fotografías de novedad al servidor local (Máx. 2 imágenes, 5MB c/u)
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Fotos subidas y guardadas exitosamente en el servidor
 *       400:
 *         description: No se enviaron archivos o formato no permitido
 */
router.post('/upload-foto', protegerRuta, upload.array('fotos', 2), reporteController.subirFotos);

/**
 * @openapi
 * /reportes/{id}:
 *   get:
 *     summary: Obtener reporte por ID con sus novedades y colaboradores
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de MongoDB del reporte
 *     responses:
 *       200:
 *         description: Reporte encontrado
 *       404:
 *         description: Reporte no encontrado
 *   delete:
 *     summary: Eliminar un reporte completo por ID
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de MongoDB del reporte a eliminar
 *     responses:
 *       200:
 *         description: Reporte eliminado exitosamente
 *       400:
 *         description: ID de reporte inválido
 *       404:
 *         description: Reporte no encontrado
 */
router.get('/:id', protegerRuta, reporteController.obtenerReporte);
router.delete('/:id', protegerRuta, reporteController.eliminarReporte);

/**
 * @openapi
 * /reportes/{id}/parametros:
 *   put:
 *     summary: Actualizar parámetros institucionales del reporte (Sección 2 - RDS e INOCAR)
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del reporte
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarParametrosReporte'
 *     responses:
 *       200:
 *         description: Parámetros del reporte actualizados exitosamente
 *       404:
 *         description: Reporte no encontrado
 */
router.put('/:id/parametros', protegerRuta, reporteController.actualizarParametros);

/**
 * @openapi
 * /reportes/{id}/novedades:
 *   post:
 *     summary: Agregar una novedad al reporte (1:N) vinculada directamente al Usuario con fotos
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del reporte
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
 *               tipo_evento: { type: string }
 *               direccion: { type: string }
 *               aga: { type: string }
 *               instituciones: { type: string }
 *               fecha_evento: { type: string }
 *               hora_evento: { type: string }
 *               latitud: { type: number }
 *               longitud: { type: number }
 *               recurso_asignado: { type: string }
 *               estado_operativo: { type: string }
 *               descripcion: { type: string }
 *               acciones_inmediatas: { type: string }
 *               fotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Novedad agregada y campo 'Elaborado por' actualizado
 */
router.post('/:id/novedades', protegerRuta, upload.array('fotos', 2), reporteController.agregarNovedad);

/**
 * @openapi
 * /reportes/{id}/novedades/{novedadId}:
 *   put:
 *     summary: Actualizar una novedad existente del reporte
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del reporte
 *       - in: path
 *         name: novedadId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la novedad a actualizar
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
 *               tipo_evento: { type: string }
 *               direccion: { type: string }
 *               aga: { type: string }
 *               instituciones: { type: string }
 *               fecha_evento: { type: string }
 *               hora_evento: { type: string }
 *               latitud: { type: number }
 *               longitud: { type: number }
 *               recurso_asignado: { type: string }
 *               estado_operativo: { type: string }
 *               descripcion: { type: string }
 *               acciones_inmediatas: { type: string }
 *               fotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Novedad actualizada exitosamente
 *       404:
 *         description: Reporte o novedad no encontrada
 *   delete:
 *     summary: Eliminar una novedad del reporte
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del reporte
 *       - in: path
 *         name: novedadId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la novedad a eliminar
 *     responses:
 *       200:
 *         description: Novedad eliminada exitosamente
 *       404:
 *         description: Reporte o novedad no encontrada
 */
router.put('/:id/novedades/:novedadId', protegerRuta, upload.array('fotos', 2), reporteController.actualizarNovedad);
router.delete('/:id/novedades/:novedadId', protegerRuta, reporteController.eliminarNovedad);

/**
 * @openapi
 * /reportes/{id}/exportar-excel:
 *   post:
 *     summary: Registrar y sincronizar novedades del reporte en el Excel de SharePoint (42 columnas)
 *     tags: [Reportes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del reporte a exportar
 *     responses:
 *       200:
 *         description: Novedades registradas exitosamente en la tabla de SharePoint
 *       400:
 *         description: El reporte no contiene novedades
 *       404:
 *         description: Reporte no encontrado
 */
router.post('/:id/exportar-excel', protegerRuta, reporteController.exportarAExcel);

module.exports = router;
