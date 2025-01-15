// src/controllers/webhookController.js
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
        return mode === 'subscribe' && token === verifyToken ? challenge : null;
    }
};

// Procesador de Mensajes
const MessageProcessor = {
    constructMessageData(message, changeContext) {
        return {
            id: message.id,
            from: message.from,
            timestamp: message.timestamp,
            type: message.type,
            // Mantener la estructura original del mensaje de texto
            text: message.type === 'text' ? { 
                body: message.text.body 
            } : undefined,
            // Mantener la estructura original del mensaje de audio
            audio: message.type === 'audio' ? {
                id: message.audio.id
            } : undefined,
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

           // Modificar el formateo del mensaje
            const formattedMessage = {
            id: messageData.id,
            from: messageData.from,
            timestamp: new Date(parseInt(messageData.timestamp) * 1000).toISOString(),
            type: messageData.type,
            // Extraer directamente el texto del body
            text: messageData.text?.body || '',  // Cambio aquí
            audio: messageData.audio?.id,
            direction: 'inbound',
            status: 'received',
            profile: messageData.profile,
            metadata: messageData.metadata
            };

            const conversation = await conversationService.processIncomingMessage(messageData);

            try {
                if (messageData.type === 'text') {
                    await whatsappService.markAsRead(messageData.id);
                    logInfo('Message marked as read', { messageId: messageData.id });
                }
            } catch (readReceiptError) {
                logError('Error marking message as read', {
                    messageId: messageData.id,
                    error: readReceiptError.message
                });
                // Continuar el proceso aunque falle el read receipt
            }

            // Notificar a través de WebSocket
            wsManager.broadcastConversationUpdate(conversation);

            logInfo('Message Processed Successfully', {
                messageId: messageData.id,
                conversationId: conversation.whatsappId,
                messageType: messageData.type,
                messageCount: conversation.messages.length,
                conversationStatus: conversation.status
            });

            return conversation;
        } catch (error) {
            logError('Message Processing Failed', {
                error: error.message,
                messageId: messageData.id,
                type: messageData.type,
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
                await this.processIndividualMessage(messageData);
                results.processed++;
                results.details.push({
                    id: message.id,
                    status: 'success',
                    type: message.type,
                    timestamp: new Date()
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

                logError('Error processing message', {
                    messageId: message.id,
                    type: message.type,
                    error: error.message,
                    stack: error.stack
                });
            }
        }

        // Notificar resultados del procesamiento por lotes
        wsManager.broadcast({
            type: 'messagesBatchProcessed',
            data: {
                ...results,
                timestamp: new Date().toISOString()
            }
        });

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
            logInfo('Processing Messages', {
                messageCount: change.value.messages.length,
                field: change.field,
                timestamp: new Date()
            });

            const messageResults = await MessageProcessor.processMessages(
                change.value.messages,
                change
            );

            results.processed += messageResults.processed;
            results.errors += messageResults.errors;
            results.details = results.details.concat(messageResults.details);

            // Notificar actualización de conversaciones
            wsManager.broadcastConversations();
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
            const changeResults = await this.processChange(change);
            results.processed += changeResults.processed;
            results.errors += changeResults.errors;
            results.details = results.details.concat(changeResults.details);
        }

        return results;
    }
};

// Controladores principales
exports.verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    logInfo('Webhook Verification Request', {
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
        logInfo('Webhook Verified Successfully');
        res.status(200).send(validChallenge);
    } else {
        logError('Webhook Verification Failed', {
            mode,
            tokenMatch: token === VERIFY_TOKEN
        });
        res.status(403).send('Forbidden');
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
        const body = req.body;
        logInfo('Webhook Payload Received', {
            headers: req.headers,
            body: body
        });

        WebhookValidator.validatePayload(body);

        for (const entry of body.entry) {
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
            activeConversations: conversationService.activeConversations.size,
            timestamp: new Date()
        };

        logInfo('Webhook Processing Summary', summary);

        // Notificar resumen de procesamiento
        wsManager.broadcast({
            type: 'webhookProcessingSummary',
            data: summary
        });

        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        const processingTime = Date.now() - startTime;
        logError('Webhook Processing General Error', {
            error: error.message,
            processingTimeMs: processingTime,
            stack: error.stack,
            timestamp: new Date()
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
        logInfo('Requesting Conversations List');
        
        const conversations = conversationService.getAllConversations();

        logInfo('Sending Conversations List', {
            count: conversations.length,
            activeConversations: conversations.length,
            timestamp: new Date().toISOString()
        });

        res.status(200).json(conversations);
    } catch (error) {
        logError('Error Retrieving Conversations', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date()
        });
        
        res.status(500).json({
            error: 'Error retrieving conversations',
            message: error.message,
            timestamp: new Date()
        });
    }
};

exports.getConversationAnalytics = async (req, res) => {
    try {
        logInfo('Requesting Conversation Analytics');
        
        const analytics = await conversationService.getConversationAnalytics();
        
        logInfo('Analytics Generated Successfully', {
            activeConversations: analytics.activeConversations,
            totalMessages: analytics.conversations.reduce((acc, conv) => acc + conv.messageCount, 0),
            timestamp: new Date().toISOString()
        });

        res.status(200).json(analytics);
    } catch (error) {
        logError('Error Generating Analytics', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date()
        });
        
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
            timestamp: new Date()
        });
    }
};

exports.handleHeartbeat = async (req, res) => {
    try {
        const { conversationId } = req.body;
        
        if (!conversationId) {
            throw new Error('ConversationId is required');
        }

        conversationService.updateConversationHeartbeat(conversationId);
        
        res.status(200).json({
            status: 'success',
            timestamp: new Date()
        });
    } catch (error) {
        logError('Heartbeat Error', {
            error: error.message,
            stack: error.stack
        });
        
        res.status(400).json({
            error: 'Heartbeat failed',
            message: error.message
        });
    }
};