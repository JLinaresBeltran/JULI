// src/routes/chatbaseRoutes.js

const express = require('express');
const router = express.Router();
const chatbaseController = require('../controllers/chatbaseController');

// Rutas para Chatbase
router.post('/servicios_publicos', chatbaseController.handleServiciosPublicos);
router.post('/telecomunicaciones', chatbaseController.handleTelecomunicaciones);
router.post('/transporte_aereo', chatbaseController.handleTransporteAereo);

module.exports = router;
