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
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        for (const entry of entries) {
            if (!entry.changes) {
                logInfo('Entry has no changes', { entryId: entry.id });
                continue;
            }

            for (const change of entry.changes) {
                // Procesar eventos de estado primero
                if (change.value?.statuses) {
                    await this._processStatuses(change.value.statuses, change.value, results);
                }
                // Luego procesar mensajes si existen
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
                // Mejorar la detección de primera interacción
                if ((status.status === 'sent' || status.status === 'delivered') && 
                    status.conversation?.origin?.type === 'user_initiated') {
                    
                    const userId = status.recipient_id;
                    
                    // Agregar log para debuggear
                    logInfo('Verificando status de conversación', {
                        userId,
                        statusType: status.status,
                        originType: status.conversation?.origin?.type,
                        hasContacts: !!context.contacts,
                        contactName: context.contacts?.[0]?.profile?.name
                    });
                    
                    const existingConversation = await conversationService.getConversation(userId);
                    
                    if (!existingConversation) {
                        logInfo('Nueva conversación detectada desde status', { 
                            userId,
                            statusType: status.status,
                            origin: status.conversation.origin.type
                        });
    
                        // Asegurarnos de tener la información del contacto
                        const userName = context.contacts?.[0]?.profile?.name || 'Usuario';
                        
                        try {
                            // Enviar mensaje de bienvenida inmediatamente
                            await welcomeHandlerService.handleInitialInteraction(
                                userId,
                                userName
                            );
                            
                            logInfo('Mensaje de bienvenida enviado exitosamente', {
                                userId,
                                userName
                            });
                            
                            // Crear la conversación después
                            const conversation = await conversationService.createConversation(
                                userId, 
                                userId
                            );
                            
                            logInfo('Conversación creada exitosamente', {
                                conversationId: conversation?.whatsappId
                            });
                        } catch (innerError) {
                            logError('Error en el proceso de bienvenida', {
                                error: innerError.message,
                                userId,
                                userName: context.contacts?.[0]?.profile?.name,
                                stack: innerError.stack
                            });
                            throw innerError;
                        }
                    }
                }
    
                results.processed++;
                results.details.push({
                    id: status.id,
                    status: 'success',
                    type: 'status',
                    statusValue: status.status,
                    isFirstInteraction: status.conversation?.origin?.type === 'user_initiated'
                });
    
            } catch (error) {
                results.errors++;
                results.details.push({
                    id: status.id,
                    status: 'error',
                    type: 'status',
                    error: error.message
                });
                logError('Error processing status', {
                    statusId: status.id,
                    error: error.message,
                    stack: error.stack,
                    context: {
                        userId: status.recipient_id,
                        statusType: status.status,
                        originType: status.conversation?.origin?.type
                    }
                });
            }
        }
    },

    async _processMessages(messages, context, results) {
        for (const message of messages) {
            try {
                logInfo('Processing message', {
                    messageId: message.id,
                    type: message.type,
                    from: message.from
                });

                // Formatear y procesar el mensaje
                const formattedMessage = formatMessage(message, context);
                const conversation = await conversationService.processIncomingMessage(formattedMessage);

                // Marcar como leído si es texto
                if (message.type === 'text') {
                    try {
                        await whatsappService.markAsRead(
                            message.id,
                            context.metadata?.phone_number_id
                        );
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
                    type: message.type,
                    isGreeting: message.type === 'text' ? isGreeting(message.text.body) : false
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
                    error: error.message,
                    stack: error.stack
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