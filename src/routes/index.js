const express = require('express');
const webhookRoutes = require('./webhookRoutes');
const chatbaseRoutes = require('./chatbaseRoutes');

const router = express.Router();

// Agregar subrutas
router.use('/webhook', webhookRoutes);
router.use('/chatbase', chatbaseRoutes);

// Ruta raíz
router.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the API' });
});

module.exports = router;
