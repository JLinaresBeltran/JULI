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
                console.log('📊 Processing status:', {
                    id: status.id,
                    status: status.status,
                    origin: status.conversation?.origin,
                    recipientId: status.recipient_id
                });
    
                // Detectar nuevo chat
                if (this._isNewChatOpening(status)) {
                    console.log('🆕 New chat detected:', {
                        userId: status.recipient_id,
                        conversationId: status.conversation?.id
                    });
    
                    try {
                        await this._handleNewChatSession(status.recipient_id, context);
                    } catch (error) {
                        console.error('❌ Failed to handle new chat:', error);
                        throw error;
                    }
                }
    
                // Actualizar resultados
                results.processed++;
                results.details.push({
                    id: status.id,
                    status: 'success',
                    type: 'status',
                    statusValue: status.status
                });
    
            } catch (error) {
                console.error('❌ Status processing error:', {
                    statusId: status.id,
                    error: error.message
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

    _isNewChatOpening(status) {
        const conditions = this._getNewChatConditions(status);
        console.log('🔄 Checking chat status:', {
            id: status.id,
            conditions,
            timestamp: status.timestamp
        });
    
        // Nueva lógica para detectar chat apertura
        return (
            conditions.hasNewConversation &&
            conditions.hasFirstTimestamp &&
            (conditions.isServiceOrigin || conditions.isMessageDelivered)
        );
    },

    _getNewChatConditions(status) {
        // El objeto para almacenar todas las condiciones que podrían indicar un nuevo chat
        const conditions = {
            hasNewConversation: !!status.conversation?.id,
            conversationOrigin: status.conversation?.origin?.type,
            hasFirstTimestamp: !status.conversation?.expiration_timestamp,
            isMessageRead: status.status === 'read',
            isMessageDelivered: status.status === 'delivered',
            isServiceOrigin: status.conversation?.origin?.type === 'service',
            isPricingService: status.pricing?.category === 'service',
        };
    
        console.log('🔍 New Chat Conditions:', conditions);
        return conditions;
    },

    async _handleNewChatSession(userId, context) {
        try {
            const userName = context.contacts?.[0]?.profile?.name || 'Usuario';
            console.log('👋 Starting welcome flow:', { userId, userName });
    
            // 1. Verificar si ya existe la conversación
            const existingChat = await conversationService.getConversation(userId);
            if (existingChat) {
                console.log('📝 Chat already exists:', existingChat.whatsappId);
                return existingChat;
            }
    
            // 2. Enviar mensaje de bienvenida
            console.log('💌 Sending welcome message...');
            const welcomeResult = await welcomeHandlerService.handleInitialInteraction(
                userId,
                userName
            );
    
            console.log('✅ Welcome message status:', {
                success: !!welcomeResult,
                messageId: welcomeResult?.messages?.[0]?.id
            });
    
            // 3. Crear la conversación
            const conversation = await conversationService.createConversation(
                userId,
                userId
            );
    
            // 4. Notificar por WebSocket
            const wsManager = WebSocketManager.getInstance();
            if (wsManager) {
                wsManager.broadcastConversationUpdate(conversation);
                wsManager.broadcastConversations();
                console.log('🔄 WebSocket notifications sent');
            }
    
            return conversation;
    
        } catch (error) {
            console.error('❌ Error in new chat flow:', {
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