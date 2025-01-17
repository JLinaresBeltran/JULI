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

function isConversationStart(change) {
    return (
        change.field === "messages" &&
        change.value?.contacts?.[0] &&
        !change.value.messages && // No hay mensajes aún
        change.value?.contacts?.[0]?.wa_id &&
        ((change.value?.conversation?.origin?.type === "user_initiated") ||
         (change.value?.statuses?.[0]?.conversation?.origin?.type === "user_initiated"))
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
                    hasStatuses: !!change.value?.statuses,
                    metadata: change.value?.metadata
                });

                // Detectar inicio de conversación
                if (isConversationStart(change)) {
                    console.log('🌟 Conversation start detected');
                    try {
                        const userId = change.value.contacts[0].wa_id;
                        await this._handleNewUserWelcome(userId, change.value);
                        results.processed++;
                        continue;
                    } catch (error) {
                        console.error('❌ Error handling conversation start:', error);
                        results.errors++;
                        continue;
                    }
                }

                // Procesar mensajes normalmente
                if (change.value?.messages) {
                    const isNewUser = await this._checkNewUser(change.value);
                    if (isNewUser) {
                        const firstMessage = change.value.messages[0];
                        console.log('👋 New user detected from message:', firstMessage.from);
                        await this._handleNewUserWelcome(firstMessage.from, change.value);
                    }
                    await this._processMessages(change.value.messages, change.value, results);
                }

                if (change.value?.statuses) {
                    await this._processStatuses(change.value.statuses, change.value, results);
                }
            }
        }

        return results;
    },

    async _checkNewUser(context) {
        if (!context.messages?.[0]) return false;
        
        const userId = context.messages[0].from;
        const existingConversation = await conversationService.getConversation(userId);
        
        console.log('🔍 Checking user status:', {
            userId,
            hasExistingConversation: !!existingConversation,
            contacts: context.contacts?.length,
            hasProfile: !!context.contacts?.[0]?.profile
        });
        
        return !existingConversation;
    },

    async _handleNewUserWelcome(userId, context) {
        try {
            console.log('✨ Starting welcome flow for:', userId);
            const userName = context.contacts?.[0]?.profile?.name || 'Usuario';

            // Verificar si ya existe conversación
            const existingConversation = await conversationService.getConversation(userId);
            if (existingConversation) {
                console.log('ℹ️ User already has conversation:', userId);
                return existingConversation;
            }

            // 1. Enviar mensaje de bienvenida primero
            console.log('📬 Sending welcome message to:', userId);
            const welcomeResult = await welcomeHandlerService.handleInitialInteraction(
                userId,
                userName
            );

            // 2. Crear la conversación
            const conversation = await conversationService.createConversation(
                userId,
                userId
            );

            console.log('📝 Conversation created:', conversation.whatsappId);

            // 3. Notificar por WebSocket
            const wsManager = WebSocketManager.getInstance();
            if (wsManager) {
                wsManager.broadcastConversationUpdate(conversation);
                wsManager.broadcastConversations();
                console.log('🔄 WebSocket notifications sent');
            }

            return conversation;
        } catch (error) {
            console.error('❌ Error in welcome flow:', {
                error: error.message,
                userId,
                stack: error.stack
            });
            throw error;
        }
    },

    async _processMessages(messages, context, results) {
        for (const message of messages) {
            try {
                console.log('📨 Processing message:', {
                    id: message.id,
                    type: message.type,
                    from: message.from,
                    timestamp: message.timestamp,
                    isText: message.type === 'text',
                    content: message.type === 'text' ? message.text?.body : undefined
                });

                const formattedMessage = formatMessage(message, context);
                const conversation = await conversationService.processIncomingMessage(
                    formattedMessage,
                    { createIfNotExists: true }
                );

                // Marcar como leído
                if (message.type === 'text') {
                    try {
                        await whatsappService.markAsRead(
                            message.id,
                            context.metadata?.phone_number_id
                        );
                        console.log('✓ Message marked as read:', message.id);
                    } catch (markError) {
                        console.error('❌ Error marking message as read:', {
                            error: markError.message,
                            messageId: message.id
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
                console.error('❌ Error processing message:', {
                    error: error.message,
                    messageId: message.id,
                    type: message.type
                });
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

    async _processStatuses(statuses, context, results) {
        for (const status of statuses) {
            try {
                console.log('📊 Processing status:', {
                    id: status.id,
                    status: status.status,
                    recipientId: status.recipient_id,
                    timestamp: status.timestamp,
                    conversationType: status.conversation?.origin?.type,
                    pricing: status.pricing?.category
                });

                // Procesar el estado
                results.processed++;
                results.details.push({
                    id: status.id,
                    status: 'success',
                    type: 'status',
                    statusValue: status.status
                });

            } catch (error) {
                console.error('❌ Status processing error:', {
                    error: error.message,
                    statusId: status.id,
                    recipientId: status.recipient_id
                });
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