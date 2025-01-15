// src/routes/index.js
const express = require('express');
const router = express.Router();
const webhookRoutes = require('./webhookRoutes');
const chatbaseRoutes = require('./chatbaseRoutes');
const { logInfo, logError } = require('../utils/logger');

// Middleware de logging para todas las rutas
router.use((req, res, next) => {
    logInfo(`API Request: ${req.method} ${req.path}`, {
        headers: req.headers['x-forwarded-for'] || req.ip,
        query: req.query,
        timestamp: new Date().toISOString()
    });
    next();
});

// Rutas de webhook
router.use('/webhook', webhookRoutes);

// Rutas de chatbase
router.use('/chatbase', chatbaseRoutes);

// Manejador de errores para las rutas de la API
router.use((err, req, res, next) => {
    logError('API route error', {
        path: req.path,
        method: req.method,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    if (!res.headersSent) {
        res.status(500).json({
            error: 'Internal API error',
            message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
            timestamp: new Date().toISOString()
        });
    }
});

// Manejador de rutas no encontradas
router.use((req, res) => {
    logError('Route not found', {
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;