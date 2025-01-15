// src/routes/index.js
const express = require('express');
const router = express.Router();
const webhookRoutes = require('./webhookRoutes');
const chatbaseRoutes = require('./chatbaseRoutes');
const { logInfo } = require('../utils/logger');

// Middleware de logging
router.use((req, res, next) => {
    logInfo(`API Request: ${req.method} ${req.path}`, {
        headers: req.headers['x-forwarded-for'] || req.ip,
        query: req.query,
        timestamp: new Date().toISOString()
    });
    next();
});

// Configuración de rutas
router.use('/webhook', webhookRoutes);
router.use('/chatbase', chatbaseRoutes);

module.exports = router;