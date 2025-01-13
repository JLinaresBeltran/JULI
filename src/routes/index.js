const express = require('express');
const router = express.Router();
const webhookRoutes = require('./webhookRoutes');
const chatbaseRoutes = require('./chatbaseRoutes');

// Rutas de webhook
router.use('/webhook', webhookRoutes);

// Rutas de chatbase
router.use('/chatbase', chatbaseRoutes);

module.exports = router;