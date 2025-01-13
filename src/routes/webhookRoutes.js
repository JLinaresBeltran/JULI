const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Ruta de verificación del webhook
router.get('/', webhookController.verifyWebhook);

// Ruta para recibir mensajes entrantes
router.post('/', webhookController.receiveMessage);

// Ruta para obtener todas las conversaciones
router.get('/conversations', webhookController.getConversations);

// Ruta para analytics de conversaciones
router.get('/analytics', webhookController.getConversationAnalytics);

module.exports = router;