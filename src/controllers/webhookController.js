// src/controllers/webhookController.js
const MessageHandler = require('../services/messageHandler');
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const welcomeHandlerService = require('../services/welcomeHandlerService');
const WebSocketManager = require('../services/websocketService');
const legalAgentSystem = require('../services/legalAgents');
const documentService = require('../services/documentService');
const chatbaseController = require('./chatbaseController');
const { logInfo, logError } = require('../utils/logger');

// Crear instancia única del MessageHandler
const messageHandler = new MessageHandler(
    conversationService,
    whatsappService,
    chatbaseController,
    legalAgentSystem,
    documentService
);

function validateWebhookPayload(body) {
    if (!body || !body.object || !Array.isArray(body.entry)) {
        return false;
    }
    return body.object === 'whatsapp_business_account';
}

function validateMessage(message, context) {
    try {
        if (!message || !message.id || !message.from || !message.timestamp) {
            logError('Invalid message structure');
            return false;
        }

        if (!context || !context.metadata || !context.contacts) {
            logError('Invalid message context');
            return false;
        }

        switch (message.type) {
            case 'text':
                if (!message.text?.body) return false;
                break;
            case 'audio':
                if (!message.audio?.id) return false;
                break;
        }

        return /^[0-9]{10,15}$/.test(message.from);
    } catch (error) {
        logError('Message validation error', { error: error.message });
        return false;
    }
}

function formatMessage(message, context) {
    try {
        const formattedMessage = {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            profile: context.contacts[0],
            metadata: {
                displayPhoneNumber: context.metadata.display_phone_number,
                phoneNumberId: context.metadata.phone_number_id
            }
        };

        switch (message.type) {
            case 'text':
                formattedMessage.text = { body: message.text.body };
                formattedMessage.isGreeting = isGreeting(message.text.body);
                break;
            case 'audio':
                formattedMessage.audio = {
                    id: message.audio.id,
                    mimeType: message.audio.mime_type,
                    voice: message.audio.voice || false,
                    duration: message.audio.duration
                };
                break;
            default:
                formattedMessage.content = { type: message.type, raw: message };
        }

        return formattedMessage;
    } catch (error) {
        logError('Message format error', { error: error.message });
        throw error;
    }
}

function isGreeting(text) {
    const greetings = ['hola', 'buenos días', 'buen día', 'buenas', 'buenas tardes', 'buenas noches', 'hi', 'hello'];
    return text && greetings.some(greeting => text.toLowerCase().trim().includes(greeting.toLowerCase()));
}

const webhookController = {
    async receiveMessage(req, res) {
        try {
            if (!validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload');
            }

            const results = { processed: 0, errors: 0, details: [] };

            for (const entry of req.body.entry) {
                for (const change of entry.changes) {
                    if (!change.value?.messages) {
                        if (this._isConversationStart(change)) {
                            await this._handleNewUserWelcome(
                                change.value.contacts[0].wa_id,
                                change.value
                            );
                            results.processed++;
                        }
                        continue;
                    }

                    const message = change.value.messages[0];
                    const context = {
                        metadata: change.value.metadata,
                        contacts: change.value.contacts
                    };

                    try {
                        // Validar mensaje
                        if (!validateMessage(message, context)) {
                            throw new Error('Invalid message format');
                        }

                        // Procesar mensaje usando MessageHandler
                        const result = await messageHandler.handleMessage(message, context);
                        
                        // Actualizar websockets si es necesario
                        const conversation = await conversationService.getConversation(message.from);
                        if (conversation) {
                            this._broadcastUpdates(conversation);
                        }

                        this._addResult(results, message, 'success', result);
                    } catch (error) {
                        this._addResult(results, message, 'error', { error });
                        logError('Message processing error', { error });
                    }
                }
            }

            logInfo('Webhook processed', { results });
            return res.status(200).send('EVENT_RECEIVED');

        } catch (error) {
            logError('Webhook error', { error });
            return res.status(200).send('EVENT_RECEIVED');
        }
    },

    _isConversationStart(change) {
        return (
            change.field === "messages" &&
            change.value?.contacts?.[0] &&
            !change.value.messages &&
            !!change.value?.contacts?.[0]?.wa_id &&
            change.value?.event === 'system_customer_welcome'
        );
    },

    async _handleNewUserWelcome(userId, context) {
        try {
            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
            const existingConversation = await conversationService.getConversation(userId);
            
            if (existingConversation) return existingConversation;

            await welcomeHandlerService.handleInitialInteraction(userId, userName, context);
            const conversation = await conversationService.createConversation(userId, userId);
            this._broadcastUpdates(conversation);

            return conversation;
        } catch (error) {
            logError('Welcome flow error', { error: error.message });
            throw error;
        }
    },

    _addResult(results, message, status, details) {
        results[status === 'success' ? 'processed' : 'errors']++;
        results.details.push({
            id: message.id,
            status,
            type: message.type,
            ...details
        });
    },

    _broadcastUpdates(conversation) {
        const wsManager = WebSocketManager.getInstance();
        if (wsManager) {
            wsManager.broadcastConversationUpdate(conversation);
            wsManager.broadcastConversations();
        }
    },

    async getConversations(req, res) {
        try {
            const conversations = await conversationService.getAllConversations();
            return res.status(200).json(conversations);
        } catch (error) {
            logError('Conversations retrieval error', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    },

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            return res.status(200).json(analytics);
        } catch (error) {
            logError('Analytics error', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = webhookController;