// src/routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { logError } = require('../utils/logger');

// Middleware de manejo de errores específico para webhook
const handleWebhookError = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (error) {
        logError('Error in webhook route', {
            path: req.path,
            method: req.method,
            error: error.message
        });

        // Para webhooks de WhatsApp, siempre respondemos 200
        if (req.path === '/') {
            return res.status(200).send('EVENT_RECEIVED');
        }
        
        // Para otras rutas, respondemos con el error apropiado
        res.status(500).json({
            error: 'Webhook processing error',
            message: error.message
        });
    }
};

// Ruta de verificación del webhook
router.get('/', handleWebhookError(webhookController.verifyWebhook));

// Ruta para recibir mensajes entrantes
router.post('/', handleWebhookError(webhookController.receiveMessage));

// Ruta para obtener todas las conversaciones
router.get('/conversations', handleWebhookError(webhookController.getConversations));

// Ruta para analytics de conversaciones
router.get('/analytics', handleWebhookError(webhookController.getConversationAnalytics));

module.exports = router;