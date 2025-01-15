// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const WebSocketManager = require('../services/websocketService');
const { logInfo, logError } = require('../utils/logger');

class WebhookController {
    constructor() {
        // Asegurarse de que las dependencias estén disponibles antes de usarlas
        try {
            this.wsManager = WebSocketManager.getInstance();
            this.setupDependencies();
        } catch (error) {
            logError('Error initializing WebhookController:', error);
            // Inicializar con valores por defecto si falla
            this.wsManager = {
                broadcast: () => {},
                broadcastConversationUpdate: () => {}
            };
        }
    }

    setupDependencies() {
        this.messageProcessor = new MessageProcessor(
            conversationService,
            whatsappService,
            this.wsManager
        );
        this.webhookProcessor = new WebhookProcessor(
            this.messageProcessor,
            this.wsManager
        );
    }

    async verifyWebhook(req, res) {
        try {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            const verifyToken = process.env.VERIFY_TOKEN;

            logInfo('Webhook verification request received', {
                mode,
                tokenMatch: token === verifyToken,
                hasChallenge: !!challenge
            });

            if (mode === 'subscribe' && token === verifyToken) {
                logInfo('Webhook verified successfully');
                return res.status(200).send(challenge);
            }

            logError('Webhook verification failed');
            return res.status(403).send('Forbidden');
        } catch (error) {
            logError('Error in webhook verification', error);
            return res.status(500).send('Internal Server Error');
        }
    }

    async receiveMessage(req, res) {
        try {
            logInfo('Webhook payload received', { body: req.body });
            
            // Validación básica del payload
            if (!req.body || !req.body.object || !Array.isArray(req.body.entry)) {
                throw new Error('Invalid webhook payload structure');
            }

            const results = await this._processWebhookPayload(req.body);
            
            logInfo('Webhook processing completed', results);
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Error processing webhook', error);
            // Siempre devolvemos 200 para el webhook de Facebook
            return res.status(200).send('EVENT_RECEIVED');
        }
    }

    async _processWebhookPayload(body) {
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        for (const entry of body.entry) {
            for (const change of entry.changes) {
                if (change.value.messages) {
                    await this._processMessages(change.value.messages, results);
                }
            }
        }

        return results;
    }

    async _processMessages(messages, results) {
        for (const message of messages) {
            try {
                const formattedMessage = this._formatMessage(message);
                const conversation = await conversationService.processIncomingMessage(formattedMessage);
                
                if (message.type === 'text') {
                    await whatsappService.markAsRead(message.id);
                }

                this.wsManager?.broadcastConversationUpdate(conversation);
                
                results.processed++;
                results.details.push({
                    id: message.id,
                    status: 'success',
                    type: message.type,
                    timestamp: new Date()
                });
            } catch (error) {
                results.errors++;
                results.details.push({
                    id: message.id,
                    status: 'error',
                    type: message.type,
                    error: error.message,
                    timestamp: new Date()
                });
                logError('Error processing message', { messageId: message.id, error });
            }
        }
    }

    _formatMessage(message) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            text: message.text?.body || '',
            audio: message.audio?.id,
            direction: 'inbound',
            status: 'received'
        };
    }

    async getConversations(req, res) {
        try {
            const conversations = conversationService.getAllConversations();
            return res.status(200).json(conversations);
        } catch (error) {
            logError('Error retrieving conversations', error);
            return res.status(500).json({ error: error.message });
        }
    }

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            return res.status(200).json(analytics);
        } catch (error) {
            logError('Error generating analytics', error);
            return res.status(500).json({ error: error.message });
        }
    }

    async handleHeartbeat(req, res) {
        try {
            const { conversationId } = req.body;
            if (!conversationId) {
                return res.status(400).json({ error: 'ConversationId is required' });
            }

            await conversationService.updateConversationHeartbeat(conversationId);
            return res.status(200).json({ status: 'success', timestamp: new Date() });
        } catch (error) {
            logError('Heartbeat error', error);
            return res.status(400).json({ error: error.message });
        }
    }
}

// Exportar una instancia única del controlador
module.exports = new WebhookController();