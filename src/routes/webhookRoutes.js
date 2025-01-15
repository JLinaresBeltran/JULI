// src/routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { logError } = require('../utils/logger');

// Middleware para manejar errores de webhook
const handleWebhookAsync = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (error) {
        logError('Error in webhook handler', { 
            path: req.path, 
            error: error.message 
        });
        return res.status(200).send('EVENT_RECEIVED');
    }
};

// Rutas principales del webhook
router.get('/', (req, res) => webhookController.verifyWebhook(req, res));
router.post('/', (req, res) => webhookController.receiveMessage(req, res));
router.get('/conversations', (req, res) => webhookController.getConversations(req, res));
router.get('/analytics', (req, res) => webhookController.getConversationAnalytics(req, res));

module.exports = router;