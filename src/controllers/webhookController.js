// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const { logInfo, logError } = require('../utils/logger');

exports.verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logInfo('Verificación de webhook recibida', { 
        mode, 
        tokenMatch: token === VERIFY_TOKEN,
        hasChallenge: !!challenge
    });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logInfo('Webhook verificado exitosamente');
        res.status(200).send(challenge);
    } else {
        logError('Fallo en verificación de webhook', { 
            mode, 
            tokenMatch: token === VERIFY_TOKEN 
        });
        res.status(403).send('Forbidden');
    }
};

exports.receiveMessage = async (req, res) => {
    try {
        // Validar token de WhatsApp en headers si es necesario
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            logInfo('Recibida solicitud sin token de autorización');
        }

        const body = req.body;
        logInfo('Webhook - Mensaje recibido', { 
            object: body.object,
            entryCount: body.entry?.length
        });

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value.messages) {
                        const messages = change.value.messages;
                        const contacts = change.value.contacts;
                        
                        logInfo('Procesando mensajes', { 
                            messageCount: messages.length,
                            hasContacts: !!contacts
                        });

                        for (const message of messages) {
                            const messageData = {
                                id: message.id,
                                from: message.from,
                                timestamp: message.timestamp,
                                type: message.type,
                                text: message.text?.body,
                                audio: message.audio?.id,
                                profile: contacts?.[0],
                                status: message.status || 'received'
                            };

                            logInfo('Procesando mensaje individual', {
                                messageId: messageData.id,
                                type: messageData.type,
                                from: messageData.from
                            });

                            try {
                                // Procesar el mensaje
                                const conversation = await conversationService.processIncomingMessage(messageData);
                                
                                // Si es un mensaje de texto, enviar confirmación de recepción
                                if (messageData.type === 'text') {
                                    await whatsappService.sendReadReceipt(messageData.from, messageData.id);
                                }

                                logInfo('Mensaje procesado correctamente', {
                                    conversationId: conversation.whatsappId,
                                    messageCount: conversation.messages.length,
                                    lastStatus: conversation.messages[conversation.messages.length - 1]?.status
                                });
                            } catch (error) {
                                logError('Error procesando mensaje individual', {
                                    error: error.message,
                                    messageId: messageData.id,
                                    type: messageData.type
                                });
                            }
                        }
                    }
                }
            }
            
            // Meta requiere una respuesta 200 OK para los webhooks
            res.status(200).send('EVENT_RECEIVED');
        } else {
            logError('Objeto no reconocido en webhook', { 
                object: body.object,
                expectedObject: 'whatsapp_business_account'
            });
            // Aún así devolvemos 200 para webhooks de Meta
            res.status(200).json({ 
                received: true,
                error: 'Objeto no válido' 
            });
        }
    } catch (error) {
        logError('Error general en webhook', {
            error: error.message,
            stack: error.stack
        });
        // Siempre devolver 200 para webhook de Meta
        res.status(200).send('ERROR_HANDLED');
    }
};

exports.getConversations = async (req, res) => {
    try {
        logInfo('Solicitud de listado de conversaciones');
        const conversations = Array.from(conversationService.activeConversations.values());
        
        const formattedConversations = conversations.map(conv => ({
            whatsappId: conv.whatsappId,
            userPhoneNumber: conv.userPhoneNumber,
            messages: conv.messages.map(msg => ({
                id: msg.id,
                timestamp: msg.timestamp,
                type: msg.type,
                direction: msg.direction,
                content: msg.content,
                status: msg.status
            })),
            startTime: conv.startTime,
            lastUpdateTime: conv.lastUpdateTime,
            status: conv.status,
            metadata: conv.metadata
        }));

        logInfo('Enviando listado de conversaciones', {
            count: formattedConversations.length,
            activeConversations: formattedConversations.length
        });

        res.status(200).json(formattedConversations);
    } catch (error) {
        logError('Error obteniendo conversaciones', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Error obteniendo conversaciones',
            message: error.message 
        });
    }
};

exports.getConversationAnalytics = async (req, res) => {
    try {
        logInfo('Solicitud de analytics de conversaciones');
        const analytics = await conversationService.getConversationAnalytics();
        
        logInfo('Analytics generados correctamente', {
            activeConversations: analytics.activeConversations,
            totalMessages: analytics.conversations.reduce((acc, conv) => acc + conv.messageCount, 0)
        });
        
        res.status(200).json(analytics);
    } catch (error) {
        logError('Error generando analytics', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
};