const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporteController');
const { protegerRuta } = require('../middlewares/authMiddleware');

/**
 * @openapi
 * /api/reportes:
 *   get:
 *     summary: Listar todos los reportes con colaboradores (N:N) y novedades (1:N)
 *     tags: [Reportes]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de reportes
 *   post:
 *     summary: Crear un nuevo reporte
 *     tags: [Reportes]
 *     security:
 *       - ApiKeyAuth: []
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
 * /api/reportes/{id}:
 *   get:
 *     summary: Obtener reporte por ID con sus novedades y colaboradores
 *     tags: [Reportes]
 *     security:
 *       - ApiKeyAuth: []
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
 */
router.get('/:id', protegerRuta, reporteController.obtenerReporte);

/**
 * @openapi
 * /api/reportes/{id}/novedades:
 *   post:
 *     summary: Agregar una novedad al reporte (1:N) y registrar al colaborador (N:N)
 *     tags: [Reportes]
 *     security:
 *       - ApiKeyAuth: []
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
 *     responses:
 *       201:
 *         description: Novedad agregada y campo 'Elaborado por' actualizado
 */
router.post('/:id/novedades', protegerRuta, reporteController.agregarNovedad);

/**
 * @openapi
 * /api/reportes/{id}/exportar-excel:
 *   post:
 *     summary: Registrar y sincronizar novedades del reporte en el Excel de SharePoint (42 columnas)
 *     tags: [Reportes]
 *     security:
 *       - ApiKeyAuth: []
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
