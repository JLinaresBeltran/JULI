// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const WebSocketManager = require('../services/websocketService');
const { logInfo, logError } = require('../utils/logger');

// Funciones auxiliares
function validateWebhookPayload(body) {
    return body && 
           body.object === 'whatsapp_business_account' && 
           Array.isArray(body.entry);
}

function formatMessage(message, context) {
    return {
        id: message.id,
        from: message.from,
        timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
        type: message.type,
        text: message.text?.body || '',
        audio: message.audio?.id,
        direction: 'inbound',
        status: 'received',
        profile: context.contacts?.[0],
        metadata: {
            displayPhoneNumber: context.metadata?.display_phone_number,
            phoneNumberId: context.metadata?.phone_number_id
        }
    };
}

// Controlador
const webhookController = {
    async verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

        logInfo('Webhook verification request', {
            mode,
            tokenMatch: token === VERIFY_TOKEN,
            hasChallenge: !!challenge
        });

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            logInfo('Webhook verified successfully');
            return res.status(200).send(challenge);
        }

        logError('Webhook verification failed');
        return res.status(403).send('Forbidden');
    },

    async receiveMessage(req, res) {
        try {
            logInfo('Webhook payload received', { body: req.body });

            if (!validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload structure');
            }

            for (const entry of req.body.entry) {
                if (entry.changes) {
                    for (const change of entry.changes) {
                        if (change.value?.messages) {
                            await this._processMessages(change.value.messages, change.value);
                        }
                    }
                }
            }

            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Error processing webhook', { error: error.message });
            return res.status(200).send('EVENT_RECEIVED');
        }
    },

    async _processMessages(messages, context) {
        for (const message of messages) {
            try {
                const formattedMessage = formatMessage(message, context);
                
                logInfo('Processing message', {
                    messageId: message.id,
                    type: message.type,
                    from: message.from
                });

                const conversation = await conversationService.processIncomingMessage(formattedMessage);

                if (message.type === 'text') {
                    try {
                        await whatsappService.markAsRead(message.id);
                        logInfo('Message marked as read', { messageId: message.id });
                    } catch (error) {
                        logError('Error marking message as read', { 
                            messageId: message.id, 
                            error: error.message 
                        });
                    }
                }

                // Notificar a través de WebSocket
                const wsManager = WebSocketManager.getInstance();
                if (wsManager) {
                    wsManager.broadcastConversationUpdate(conversation);
                    wsManager.broadcastConversations();
                }

            } catch (error) {
                logError('Error processing message', {
                    messageId: message.id,
                    error: error.message
                });
            }
        }
    },

    async getConversations(req, res) {
        try {
            const conversations = await conversationService.getAllConversations();
            logInfo('Conversations retrieved', { count: conversations.length });
            return res.status(200).json(conversations);
        } catch (error) {
            logError('Error retrieving conversations', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    },

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            logInfo('Analytics generated', { timestamp: new Date().toISOString() });
            return res.status(200).json(analytics);
        } catch (error) {
            logError('Error generating analytics', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = webhookController;