const express = require('express');
const router = express.Router();
const novedadController = require('../controllers/novedadController');
const { protegerRuta } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.get('/', protegerRuta, novedadController.listarNovedades);

router.get('/:id', protegerRuta, novedadController.obtenerNovedad);

router.post('/', protegerRuta, upload.array('fotos', 2), novedadController.crearNovedad);

router.put('/:id', protegerRuta, upload.array('fotos', 2), novedadController.actualizarNovedad);

router.delete('/:id', protegerRuta, novedadController.eliminarNovedad);

module.exports = router;
