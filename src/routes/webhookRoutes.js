const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController'); // Importa el controlador

// Ruta de verificación del webhook
router.get('/', webhookController.verifyWebhook);

// Ruta para recibir mensajes entrantes
router.post('/', webhookController.receiveMessage);

module.exports = router;
