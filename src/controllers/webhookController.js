// src/controllers/webhookController.js

const welcomeHandler = require('../services/welcomeHandlerService');
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const WebSocketManager = require('../services/websocketService');
const { logInfo, logError } = require('../utils/logger');

// Obtener la instancia del WebSocket Manager
const wsManager = WebSocketManager.getInstance();

// Validadores
const WebhookValidator = {
    validatePayload(body) {
        if (!body || !body.object) {
            throw new Error('Invalid payload structure');
        }

        if (body.object !== 'whatsapp_business_account') {
            throw new Error('Unexpected webhook object type');
        }

        if (!Array.isArray(body.entry)) {
            throw new Error('Invalid entry structure');
        }

        return true;
    },

    validateVerification(mode, token, challenge, verifyToken) {
        if (mode !== 'subscribe' || token !== verifyToken) {
            return null;
        }
        return challenge;
    }
};

// Procesador de Mensajes
const MessageProcessor = {
    constructMessageData(message, changeContext) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            text: message.text,
            audio: message.audio,
            document: message.document,
            profile: changeContext.value.contacts?.[0],
            status: message.status || 'received',
            metadata: {
                displayPhoneNumber: changeContext.value.metadata?.display_phone_number,
                phoneNumberId: changeContext.value.metadata?.phone_number_id
            }
        };
    },

    async processIndividualMessage(messageData) {
        try {
            logInfo('Procesando mensaje individual', {
                messageId: messageData.id,
                type: messageData.type,
                from: messageData.from
            });

            // Obtener o crear la conversación
            const conversation = await conversationService.getConversation(messageData.from) || 
                               await conversationService.createConversation(messageData.from);

            // Determinar si es el primer mensaje
            const isFirstMessage = conversation.messages.length === 0;
            messageData.isFirstMessage = isFirstMessage;

            // Procesar con welcomeHandler
            const handlerResponse = await welcomeHandler.handleIncomingMessage(
                messageData,
                messageData.profile
            );

            // Agregar el mensaje a la conversación
            await conversationService.addMessage(conversation.whatsappId, {
                id: messageData.id,
                timestamp: messageData.timestamp,
                type: messageData.type,
                direction: 'inbound',
                content: messageData.text?.body || messageData.audio?.id || '',
                status: 'received'
            });

            // Marcar como leído si es mensaje de texto
            if (messageData.type === 'text') {
                try {
                    await whatsappService.markAsRead(messageData.id);
                    logInfo('Mensaje marcado como leído', { messageId: messageData.id });
                } catch (readError) {
                    logError('Error marcando mensaje como leído:', readError);
                }
            }

            // Enviar respuesta según el tipo
            if (handlerResponse.type === 'welcome') {
                await whatsappService.sendMessage(messageData.from, handlerResponse.content);
            } else if (handlerResponse.type === 'redirect') {
                // Actualizar metadatos de la conversación
                conversation.metadata.serviceType = handlerResponse.serviceType;
                await conversationService.updateConversation(conversation);
                
                // Enviar respuesta del chatbot
                await whatsappService.sendMessage(messageData.from, handlerResponse.response);
            }

            // Notificar a través de WebSocket
            wsManager.broadcastConversationUpdate(conversation);

            logInfo('Mensaje procesado exitosamente', {
                messageId: messageData.id,
                conversationId: conversation.whatsappId,
                type: messageData.type
            });

            return {
                success: true,
                handlerResponse,
                conversation
            };

        } catch (error) {
            logError('Error procesando mensaje:', {
                error: error.message,
                messageId: messageData.id,
                stack: error.stack
            });
            throw error;
        }
    },

    async processMessages(messages, changeContext) {
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        for (const message of messages) {
            try {
                const messageData = this.constructMessageData(message, changeContext);
                const processResult = await this.processIndividualMessage(messageData);
                
                results.processed++;
                results.details.push({
                    id: message.id,
                    status: 'success',
                    type: message.type,
                    timestamp: new Date(),
                    response: processResult.handlerResponse
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
                logError('Error procesando mensaje:', error);
            }
        }

        return results;
    }
};

// Procesador de Webhook
const WebhookProcessor = {
    async processChange(change) {
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        if (change.value.messages) {
            logInfo('Procesando mensajes', {
                count: change.value.messages.length,
                field: change.field
            });

            const messageResults = await MessageProcessor.processMessages(
                change.value.messages,
                change
            );

            results.processed += messageResults.processed;
            results.errors += messageResults.errors;
            results.details = results.details.concat(messageResults.details);

            // Notificar actualización
            wsManager.broadcastConversations();
        }

        if (change.value.statuses) {
            // Procesar actualizaciones de estado de mensajes
            for (const status of change.value.statuses) {
                try {
                    await conversationService.updateMessageStatus(
                        status.id,
                        status.status,
                        status.timestamp
                    );
                } catch (error) {
                    logError('Error actualizando estado de mensaje:', error);
                }
            }
        }

        return results;
    },

    async processEntry(entry) {
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        for (const change of entry.changes) {
            try {
                const changeResults = await this.processChange(change);
                results.processed += changeResults.processed;
                results.errors += changeResults.errors;
                results.details = results.details.concat(changeResults.details);
            } catch (error) {
                logError('Error procesando cambio:', error);
                results.errors++;
            }
        }

        return results;
    }
};

// Controladores principales
exports.verifyWebhook = (req, res) => {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

        logInfo('Solicitud de verificación de webhook', {
            mode,
            tokenMatch: token === VERIFY_TOKEN,
            hasChallenge: !!challenge
        });

        const validChallenge = WebhookValidator.validateVerification(
            mode,
            token,
            challenge,
            VERIFY_TOKEN
        );

        if (validChallenge) {
            logInfo('Webhook verificado exitosamente');
            res.status(200).send(validChallenge);
        } else {
            logError('Verificación de webhook fallida');
            res.status(403).send('Forbidden');
        }
    } catch (error) {
        logError('Error en verificación de webhook:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.receiveMessage = async (req, res) => {
    const startTime = Date.now();
    const results = {
        processed: 0,
        errors: 0,
        details: []
    };

    try {
        logInfo('Payload de webhook recibido', {
            body: req.body,
            headers: req.headers
        });

        WebhookValidator.validatePayload(req.body);

        for (const entry of req.body.entry) {
            const entryResults = await WebhookProcessor.processEntry(entry);
            results.processed += entryResults.processed;
            results.errors += entryResults.errors;
            results.details = results.details.concat(entryResults.details);
        }

        const processingTime = Date.now() - startTime;
        const summary = {
            totalMessages: results.processed + results.errors,
            processedMessages: results.processed,
            failedMessages: results.errors,
            processingTimeMs: processingTime,
            activeConversations: conversationService.getActiveConversationCount(),
            timestamp: new Date()
        };

        logInfo('Resumen de procesamiento de webhook', summary);

        // Notificar resumen de procesamiento
        wsManager.broadcast({
            type: 'webhookProcessingSummary',
            data: summary
        });

        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logError('Error general en procesamiento de webhook:', {
            error: error.message,
            processingTimeMs: processingTime,
            stack: error.stack
        });

        // Notificar error
        wsManager.broadcast({
            type: 'webhookProcessingError',
            data: {
                error: error.message,
                timestamp: new Date()
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    }
};

exports.getConversations = async (req, res) => {
    try {
        const conversations = conversationService.getAllConversations();
        logInfo('Enviando lista de conversaciones', {
            count: conversations.length
        });
        res.status(200).json(conversations);
    } catch (error) {
        logError('Error obteniendo conversaciones:', error);
        res.status(500).json({
            error: 'Error retrieving conversations',
            message: error.message
        });
    }
};

exports.getConversationAnalytics = async (req, res) => {
    try {
        const analytics = await conversationService.getConversationAnalytics();
        res.status(200).json(analytics);
    } catch (error) {
        logError('Error generando analytics:', error);
        res.status(500).json({
            error: 'Error generating analytics',
            message: error.message
        });
    }
};

exports.handleHeartbeat = async (req, res) => {
    try {
        const { conversationId } = req.body;
        if (!conversationId) {
            throw new Error('ConversationId is required');
        }

        await conversationService.updateConversationHeartbeat(conversationId);
        res.status(200).json({
            status: 'success',
            timestamp: new Date()
        });
    } catch (error) {
        logError('Error en heartbeat:', error);
        res.status(400).json({
            error: 'Heartbeat failed',
            message: error.message
        });
    }
};