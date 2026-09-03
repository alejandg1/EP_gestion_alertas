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

router.get('/', protegerRuta, novedadController.listarNovedades);

router.get('/:id', protegerRuta, novedadController.obtenerNovedad);

router.post('/', protegerRuta, upload.array('fotos', 2), novedadController.crearNovedad);

router.put('/:id', protegerRuta, upload.array('fotos', 2), novedadController.actualizarNovedad);

router.delete('/:id', protegerRuta, novedadController.eliminarNovedad);

module.exports = router;
