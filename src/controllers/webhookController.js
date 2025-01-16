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
                // Procesar mensajes si existen
                if (change.value?.messages) {
                    await this._processMessages(change.value.messages, change.value, results);
                }
                // Procesar eventos de estado después
                if (change.value?.statuses) {
                    await this._processStatuses(change.value.statuses, change.value, results);
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

                // 1. Verificar si existe la conversación
                const existingConversation = await conversationService.getConversation(message.from);
                const isFirstInteraction = !existingConversation;

                let conversation;

                // 2. Si es primera interacción, manejar el flujo de bienvenida
                if (isFirstInteraction) {
                    logInfo('First interaction detected, handling welcome flow', {
                        userId: message.from,
                        userName: context.contacts?.[0]?.profile?.name
                    });

                    try {
                        // Enviar mensaje de bienvenida primero
                        await welcomeHandlerService.handleInitialInteraction(
                            message.from,
                            context.contacts?.[0]?.profile?.name || 'Usuario'
                        );

                        // Crear la conversación después del mensaje de bienvenida
                        conversation = await conversationService.createConversation(
                            message.from,
                            message.from
                        );

                        logInfo('Welcome flow completed successfully', {
                            userId: message.from,
                            conversationId: conversation.whatsappId
                        });
                    } catch (welcomeError) {
                        logError('Error in welcome flow', {
                            error: welcomeError.message,
                            userId: message.from,
                            stack: welcomeError.stack
                        });
                        throw welcomeError;
                    }
                } else {
                    conversation = existingConversation;
                }

                // 3. Procesar el mensaje entrante
                const formattedMessage = formatMessage(message, context);
                
                // Actualizar la conversación con el nuevo mensaje
                conversation = await conversationService.processIncomingMessage(
                    formattedMessage,
                    { createIfNotExists: true }
                );

                // 4. Marcar como leído si es texto
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

                // 5. Notificar por WebSocket
                const wsManager = WebSocketManager.getInstance();
                if (wsManager) {
                    wsManager.broadcastConversationUpdate(conversation);
                    wsManager.broadcastConversations();
                }

                // 6. Actualizar resultados
                results.processed++;
                results.details.push({
                    id: message.id,
                    status: 'success',
                    type: message.type,
                    isFirstInteraction,
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

    async _processStatuses(statuses, context, results) {
        for (const status of statuses) {
            try {
                // Solo procesamos estados específicos
                if (['sent', 'delivered', 'read'].includes(status.status)) {
                    logInfo('Processing message status', {
                        statusId: status.id,
                        status: status.status,
                        recipientId: status.recipient_id
                    });

                    results.processed++;
                    results.details.push({
                        id: status.id,
                        status: 'success',
                        type: 'status',
                        statusValue: status.status
                    });
                }
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