// src/routes/chatbaseRoutes.js
const express = require('express');
const router = express.Router();
const {
    handleServiciosPublicos,
    handleTelecomunicaciones,
    handleTransporteAereo,
    handleWebhook
} = require('../controllers/chatbaseController');

// Middleware específico para el webhook
const rawBodyMiddleware = express.raw({ 
    type: 'application/json',
    limit: '50mb'
});

// Middleware para procesar el body raw
const processRawBody = (req, res, next) => {
    if (req.body) {
        req.rawBody = req.body;
        req.body = JSON.parse(req.body);
    }
    next();
};

// Rutas existentes para mensajes
router.post('/servicios_publicos', handleServiciosPublicos);
router.post('/telecomunicaciones', handleTelecomunicaciones);
router.post('/transporte_aereo', handleTransporteAereo);

// Ruta para el webhook
router.post('/webhook',
    rawBodyMiddleware,
    processRawBody,
    handleWebhook
);

module.exports = router;