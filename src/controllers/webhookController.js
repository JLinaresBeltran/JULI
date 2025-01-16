// src/controllers/webhookController.js

const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const welcomeHandlerService = require('../services/welcomeHandlerService');
const WebSocketManager = require('../services/websocketService');
const { logInfo, logError } = require('../utils/logger');

// Funciones auxiliares mejoradas
function validateWebhookPayload(body) {
    if (!body || !body.object || !Array.isArray(body.entry)) {
        return false;
    }
    return body.object === 'whatsapp_business_account';
}

function validateMessage(message, context) {
    try {
        // Validación básica de estructura
        if (!message || !message.id || !message.from || !message.timestamp) {
            logError('Invalid message structure', { message });
            return false;
        }

        // Validación del contexto
        if (!context || !context.metadata || !context.contacts) {
            logError('Invalid message context', { context });
            return false;
        }

        // Validación específica por tipo de mensaje
        switch (message.type) {
            case 'text':
                if (!message.text?.body) {
                    logError('Invalid text message structure', { message });
                    return false;
                }
                break;
            case 'audio':
                if (!message.audio?.id) {
                    logError('Invalid audio message structure', { message });
                    return false;
                }
                break;
        }

        // Validación del formato del número de teléfono
        const phoneRegex = /^[0-9]{10,15}$/;
        if (!phoneRegex.test(message.from)) {
            logError('Invalid phone number format', { from: message.from });
            return false;
        }

        return true;
    } catch (error) {
        logError('Error in message validation', { error: error.message });
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

        // Mantener la estructura original del mensaje
        switch (message.type) {
            case 'text':
                formattedMessage.text = {
                    body: message.text.body
                };
                formattedMessage.isGreeting = isGreeting(message.text.body);
                break;
            case 'audio':
                formattedMessage.audio = {
                    id: message.audio.id,
                    mimeType: message.audio.mime_type,
                    voice: message.audio.voice || false
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

function isGreeting(text) {
    const greetings = [
        'hola',
        'buenos días',
        'buen día',
        'buenas',
        'buenas tardes',
        'buenas noches',
        'hi',
        'hello'
    ];
    return text && greetings.some(greeting => 
        text.toLowerCase().trim().includes(greeting.toLowerCase())
    );
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
            console.log('🔄 Webhook payload:', JSON.stringify(req.body, null, 2));
            logInfo('Webhook payload received', { body: req.body });

            if (!validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload structure');
            }

            const results = await this._processEntries(req.body.entry);
            
            logInfo('Webhook processing completed', { results });
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Error processing webhook', { 
                error: error.message,
                stack: error.stack
            });
            return res.status(200).send('EVENT_RECEIVED');
        }
    },

    async _processEntries(entries) {
        console.log('📝 Processing entries:', entries.length);
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        for (const entry of entries) {
            if (!entry.changes) {
                console.log('⚠️ Entry has no changes:', entry.id);
                continue;
            }

            for (const change of entry.changes) {
                console.log('🔄 Processing change:', {
                    field: change.field,
                    hasMessages: !!change.value?.messages,
                    hasStatuses: !!change.value?.statuses
                });

                // Procesar estados primero
                if (change.value?.statuses) {
                    await this._processStatuses(change.value.statuses, change.value, results);
                }
                
                // Luego procesar mensajes
                if (change.value?.messages) {
                    await this._processMessages(change.value.messages, change.value, results);
                }
            }
        }

        return results;
    },

    async _processStatuses(statuses, context, results) {
        for (const status of statuses) {
            try {
                // Log detallado del estado
                console.log('📊 Status Details:', {
                    id: status.id,
                    status: status.status,
                    timestamp: status.timestamp,
                    recipientId: status.recipient_id,
                    conversationType: status.conversation?.origin?.type,
                    pricing: status.pricing?.category,
                    hasExpiration: !!status.conversation?.expiration_timestamp,
                    origin: status.conversation?.origin
                });

                // Detectar nuevo chat o apertura de conversación
                const isNewChat = this._isNewChatOpening(status);
                console.log('🔍 New Chat Detection:', {
                    isNewChat,
                    statusId: status.id,
                    conditions: this._getNewChatConditions(status)
                });

                if (isNewChat) {
                    const userId = status.recipient_id;
                    const existingConversation = await conversationService.getConversation(userId);

                    if (!existingConversation) {
                        console.log('🆕 Starting new chat flow for:', userId);
                        await this._handleNewChatSession(userId, context);
                    }
                }

                results.processed++;
                results.details.push({
                    id: status.id,
                    status: 'success',
                    type: 'status',
                    statusValue: status.status,
                    isNewChat
                });

            } catch (error) {
                console.error('❌ Error processing status:', error);
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

    _isNewChatOpening(status) {
        const conditions = this._getNewChatConditions(status);
        return Object.values(conditions).some(condition => condition === true);
    },

    _getNewChatConditions(status) {
        return {
            isUserInitiated: status.conversation?.origin?.type === 'user_initiated',
            isNewConversation: !status.conversation?.expiration_timestamp && status.status === 'sent',
            isPricingUserInitiated: status.pricing?.category === 'user_initiated',
            isFirstDelivery: status.status === 'sent' && !status.conversation?.expiration_timestamp,
            isServiceMessage: status.conversation?.origin?.type === 'service' && status.status === 'sent'
        };
    },

    async _handleNewChatSession(userId, context) {
        try {
            const userName = context.contacts?.[0]?.profile?.name || 'Usuario';
            console.log('👋 Starting welcome flow for:', { userId, userName });

            // 1. Enviar mensaje de bienvenida
            const welcomeResult = await welcomeHandlerService.handleInitialInteraction(
                userId,
                userName
            );

            console.log('✉️ Welcome message sent:', {
                userId,
                messageId: welcomeResult?.messages?.[0]?.id
            });

            // 2. Crear la conversación
            const conversation = await conversationService.createConversation(
                userId,
                userId
            );

            console.log('💬 Conversation created:', {
                conversationId: conversation.whatsappId
            });

            // 3. Notificar por WebSocket
            const wsManager = WebSocketManager.getInstance();
            if (wsManager) {
                wsManager.broadcastConversationUpdate(conversation);
                wsManager.broadcastConversations();
                console.log('🔄 WebSocket notifications sent');
            }

            return conversation;
        } catch (error) {
            console.error('❌ Error in new chat session:', error);
            throw error;
        }
    },

    async _processMessages(messages, context, results) {
        for (const message of messages) {
            try {
                console.log('📨 Processing message:', {
                    id: message.id,
                    type: message.type,
                    from: message.from
                });

                const formattedMessage = formatMessage(message, context);
                const conversation = await conversationService.processIncomingMessage(
                    formattedMessage,
                    { createIfNotExists: true }
                );

                // Marcar como leído si es texto
                if (message.type === 'text') {
                    await whatsappService.markAsRead(
                        message.id,
                        context.metadata?.phone_number_id
                    );
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
                console.error('❌ Error processing message:', error);
                results.errors++;
                results.details.push({
                    id: message.id,
                    status: 'error',
                    type: message.type,
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
            logError('Error retrieving conversations', { 
                error: error.message,
                stack: error.stack 
            });
            return res.status(500).json({ error: error.message });
        }
    },

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            logInfo('Analytics generated', { timestamp: new Date().toISOString() });
            return res.status(200).json(analytics);
        } catch (error) {
            logError('Error generating analytics', { 
                error: error.message,
                stack: error.stack 
            });
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = webhookController;