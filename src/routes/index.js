const express = require('express');
const router = express.Router();
const webhookRoutes = require('./webhookRoutes'); // Importar las rutas del webhook

// Usar las rutas del webhook bajo /webhook
router.use('/webhook', webhookRoutes);

module.exports = router;
