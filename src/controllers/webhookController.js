// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const WebSocketManager = require('../services/websocketService');
const { logInfo, logError } = require('../utils/logger');

// Funciones auxiliares
function validateWebhookPayload(body) {
    if (!body || !body.object || !Array.isArray(body.entry)) {
        return false;
    }
    return body.object === 'whatsapp_business_account';
}

function validateMessage(message, context) {
    if (!message || !message.id || !message.from || !message.timestamp) {
        logError('Invalid message structure', { message });
        return false;
    }

    if (!context || !context.metadata || !context.contacts) {
        logError('Invalid message context', { context });
        return false;
    }

    return true;
}

function formatMessage(message, context) {
    try {
        // Validación detallada del mensaje
        if (!validateMessage(message, context)) {
            throw new Error('Invalid message structure');
        }

        const formattedMessage = {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            content: {}, // Inicializar contenido vacío
            profile: context.contacts[0],
            metadata: {
                displayPhoneNumber: context.metadata.display_phone_number,
                phoneNumberId: context.metadata.phone_number_id
            }
        };

        // Agregar contenido según el tipo de mensaje
        switch (message.type) {
            case 'text':
                if (!message.text?.body) {
                    throw new Error('Invalid text message structure');
                }
                formattedMessage.content = {
                    text: message.text.body
                };
                break;
            case 'audio':
                if (!message.audio?.id) {
                    throw new Error('Invalid audio message structure');
                }
                formattedMessage.content = {
                    audioId: message.audio.id
                };
                break;
            default:
                formattedMessage.content = {
                    type: message.type,
                    raw: message
                };
        }

        return formattedMessage;
    } catch (error) {
        logError('Error formatting message', {
            error: error.message,
            message,
            context
        });
        throw error;
    }
}

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

            const results = await this._processEntries(req.body.entry);
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Error processing webhook', { error: error.message });
            return res.status(200).send('EVENT_RECEIVED');
        }
    },

    async _processEntries(entries) {
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        for (const entry of entries) {
            if (!entry.changes) continue;

            for (const change of entry.changes) {
                if (change.value?.messages) {
                    await this._processMessages(change.value.messages, change.value, results);
                }
            }
        }

        return results;
    },

    async _processMessages(messages, context, results) {
        for (const message of messages) {
            try {
                logInfo('Processing message', {
                    messageId: message.id,
                    type: message.type,
                    from: message.from
                });

                const formattedMessage = formatMessage(message, context);
                const conversation = await conversationService.processIncomingMessage(formattedMessage);

                // Marcar como leído si es texto
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

                // Notificar por WebSocket
                const wsManager = WebSocketManager.getInstance();
                if (wsManager) {
                    wsManager.broadcastConversationUpdate(conversation);
                    wsManager.broadcastConversations();
                }

                results.processed++;
                results.details.push({
                    id: message.id,
                    status: 'success',
                    type: message.type
                });

            } catch (error) {
                results.errors++;
                results.details.push({
                    id: message.id,
                    status: 'error',
                    type: message.type,
                    error: error.message
                });

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