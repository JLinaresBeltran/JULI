// src/routes/chatbaseRoutes.js

const express = require('express');
const router = express.Router();
const {
    handleServiciosPublicos,
    handleTelecomunicaciones,
} = require('../controllers/chatbaseController'); // Importar solo las funciones necesarias

// Rutas para Chatbase
router.post('/servicios_publicos', handleServiciosPublicos);
router.post('/telecomunicaciones', handleTelecomunicaciones);

// Ruta eliminada o pendiente de implementación
// router.post('/transporte_aereo', handleTransporteAereo);

module.exports = router;
