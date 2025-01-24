const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const welcomeHandlerService = require('../services/welcomeHandlerService');
const WebSocketManager = require('../services/websocketService');
const legalAgentSystem = require('../services/legalAgents');
const documentService = require('../services/documentService');
const { logInfo, logError } = require('../utils/logger');

const DOCUMENT_TRIGGER = "juli quiero el documento";

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
    async verifyWebhook(req, res) {
        const { mode, token, challenge } = {
            mode: req.query['hub.mode'],
            token: req.query['hub.verify_token'],
            challenge: req.query['hub.challenge']
        };
        
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        return res.status(403).send('Forbidden');
    },

    async receiveMessage(req, res) {
        try {
            if (!validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload');
            }

            const results = { processed: 0, errors: 0, details: [] };

            for (const entry of req.body.entry) {
                for (const change of entry.changes) {
                    if (this._isConversationStart(change)) {
                        try {
                            const userId = change.value.contacts[0].wa_id;
                            await this._handleNewUserWelcome(userId, change.value);
                            results.processed++;
                            continue;
                        } catch (error) {
                            logError('Welcome flow error', { error: error.message });
                            results.errors++;
                        }
                    }

                    if (change.value?.messages) {
                        const message = change.value.messages[0];
                        
                        // Check document trigger before any processing
                        if (message.type === 'text' && 
                            message.text.body.toLowerCase().trim() === DOCUMENT_TRIGGER) {
                            await this._handleDocumentTrigger(message, change.value);
                            return;
                        }

                        await this._processMessages(change.value.messages, change.value, results);
                    }

                    if (change.value?.statuses) {
                        await this._processStatuses(change.value.statuses, change.value, results);
                    }
                }
            }

            logInfo('Webhook processed', { results });
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Webhook error', { error: error.message });
            return res.status(200).send('EVENT_RECEIVED');
        }
    },

    async _handleDocumentTrigger(message, context) {
        try {
            const conversation = await conversationService.getConversation(message.from);
            
            const customerData = {
                name: context.contacts?.[0]?.profile?.name,
                documentNumber: conversation.metadata?.documentNumber,
                email: conversation.metadata?.email,
                phone: message.from,
                address: "No especificado",
                numero_reserva: "DEFAULT123",
                numero_vuelo: "XY000",
                fecha_vuelo: new Date().toISOString().split('T')[0],
                ruta: "BOG-MIA",
                valor_tiquete: "0"
            };
 
            if (!customerData.email) {
                await whatsappService.sendTextMessage(
                    message.from,
                    "Indícame tu correo electrónico"
                );
                return;
            }
 
            await whatsappService.sendTextMessage(
                message.from,
                "Estoy procesando tu solicitud para generar el documento. Esto puede tomar unos momentos."
            );
 
            const result = await legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );
 
            await documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );
 
            await whatsappService.sendTextMessage(
                message.from,
                "¡Listo! Tu documento ha sido generado y enviado a tu correo electrónico."
            );
 
        } catch (error) {
            logError('Error handling document trigger', { error });
            throw error;
        }
    },

    _validateCustomerData(customerData) {
        const requiredFields = ['email'];
        return requiredFields.filter(field => !customerData[field]);
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

    async _processMessages(messages, context, results) {
        for (const message of messages) {
            try {
                logInfo('Processing incoming message', {
                    messageId: message.id,
                    type: message.type,
                    from: message.from
                });

                if (!validateMessage(message, context)) {
                    throw new Error('Invalid message format');
                }

                const conversation = await conversationService.getConversation(message.from);
                const isNewUser = !conversation;

                if (isNewUser) {
                    await this._handleNewUserWelcome(message.from, context);
                }

                const formattedMessage = formatMessage(message, context);

                if (message.type === 'audio') {
                    logInfo('Processing audio message', {
                        messageId: message.id,
                        duration: message.audio?.duration,
                        mimeType: message.audio?.mime_type
                    });
                }

                await conversationService.processIncomingMessage(formattedMessage, {
                    createIfNotExists: true,
                    skipClassification: isNewUser
                });

                if (message.type === 'text' || message.type === 'audio') {
                    await whatsappService.markAsRead(message.id);
                }

                this._broadcastUpdates(conversation);
                this._addResult(results, message, 'success', { 
                    isFirstInteraction: isNewUser,
                    messageType: message.type
                });

            } catch (error) {
                logError('Message processing error', { 
                    error: error.message,
                    messageId: message?.id,
                    messageType: message?.type
                });
                this._addResult(results, message, 'error', error);
            }
        }
    },

    async _processStatuses(statuses, context, results) {
        for (const status of statuses) {
            try {
                results.processed++;
                results.details.push({
                    id: status.id,
                    status: 'success',
                    type: 'status',
                    statusValue: status.status
                });
            } catch (error) {
                logError('Status processing error', { error: error.message });
                results.errors++;
                results.details.push({
                    id: status.id,
                    status: 'error',
                    type: 'status',
                    error: error.message
                });
            }
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