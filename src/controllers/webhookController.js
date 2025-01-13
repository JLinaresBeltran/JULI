// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const { logInfo, logError } = require('../utils/logger');

exports.verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logInfo('Verificación de webhook recibida', { mode, token });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logInfo('Webhook verificado exitosamente');
        res.status(200).send(challenge);
    } else {
        logError('Fallo en verificación de webhook', { mode, token });
        res.status(403).send('Forbidden');
    }
};

exports.receiveMessage = async (req, res) => {
    try {
        const body = req.body;
        logInfo('Webhook - Mensaje recibido', { body: JSON.stringify(body, null, 2) });

        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value.messages) {
                        logInfo('Procesando mensajes', { 
                            messages: change.value.messages,
                            contacts: change.value.contacts 
                        });

                        for (const message of change.value.messages) {
                            const messageData = {
                                id: message.id,
                                from: message.from,
                                timestamp: message.timestamp,
                                type: message.type,
                                text: message.text?.body,
                                audio: message.audio?.id,
                                profile: change.value.contacts?.[0]
                            };

                            logInfo('Procesando mensaje individual', messageData);

                            try {
                                const conversation = await conversationService.processIncomingMessage(messageData);
                                logInfo('Mensaje procesado correctamente', {
                                    conversationId: conversation.whatsappId,
                                    messageCount: conversation.messages.length
                                });
                            } catch (error) {
                                logError('Error procesando mensaje individual', {
                                    error: error.message,
                                    messageData
                                });
                            }
                        }
                    }
                }
            }
            res.status(200).send('Evento procesado');
        } else {
            logError('Objeto no reconocido en webhook', { object: body.object });
            res.status(400).json({ error: 'Objeto no válido' });
        }
    } catch (error) {
        logError('Error general en webhook', {
            error: error.message,
            stack: error.stack
        });
        // Siempre devolver 200 para webhook de Meta
        res.status(200).send('Error procesado');
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
            count: formattedConversations.length
        });

        res.status(200).json(formattedConversations);
    } catch (error) {
        logError('Error obteniendo conversaciones', error);
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
            activeConversations: analytics.activeConversations
        });
        
        res.status(200).json(analytics);
    } catch (error) {
        logError('Error generando analytics', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};