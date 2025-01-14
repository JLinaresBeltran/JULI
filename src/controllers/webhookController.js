// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const { logInfo, logError } = require('../utils/logger');

exports.verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logInfo('📡 Webhook Verification Request', { 
        mode, 
        tokenMatch: token === VERIFY_TOKEN,
        hasChallenge: !!challenge
    });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logInfo('✅ Webhook Verified Successfully');
        res.status(200).send(challenge);
    } else {
        logError('❌ Webhook Verification Failed', { 
            mode, 
            tokenMatch: token === VERIFY_TOKEN 
        });
        res.status(403).send('Forbidden');
    }
};

exports.receiveMessage = async (req, res) => {
    const startTime = Date.now();
    
    try {
        const body = req.body;
        console.log('📩 Webhook Received', {
            timestamp: new Date().toISOString(),
            objectType: body.object,
            hasMessages: body.entry?.[0]?.changes?.[0]?.value?.messages?.length > 0
        });
        
        if (body.object === 'whatsapp_business_account') {
            let processedMessageCount = 0;
            let errorMessageCount = 0;

            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value.messages) {
                        const messages = change.value.messages;
                        
                        logInfo('📬 Processing Messages', { 
                            messageCount: messages.length,
                            timestamp: new Date().toISOString()
                        });

                        for (const message of messages) {
                            const messageData = {
                                id: message.id,
                                from: message.from,
                                timestamp: message.timestamp,
                                type: message.type,
                                text: message.text?.body,
                                audio: message.audio?.id,
                                profile: change.value.contacts?.[0],
                                status: message.status || 'received'
                            };

                            try {
                                // Procesar el mensaje
                                const conversation = await conversationService.processIncomingMessage(messageData);
                                
                                // Si es un mensaje de texto, enviar confirmación de recepción
                                if (messageData.type === 'text') {
                                    await whatsappService.sendReadReceipt(messageData.from, messageData.id);
                                }

                                console.log('✅ Message Processed Successfully', {
                                    messageId: messageData.id,
                                    conversationId: conversation.whatsappId,
                                    messageType: messageData.type,
                                    messageCount: conversation.messages.length
                                });

                                processedMessageCount++;
                            } catch (error) {
                                console.error('❌ Individual Message Processing Error', {
                                    error: error.message,
                                    messageId: messageData.id,
                                    messageType: messageData.type,
                                    stack: error.stack
                                });

                                logError('Message Processing Failed', {
                                    error: error.message,
                                    messageId: messageData.id,
                                    type: messageData.type
                                });

                                errorMessageCount++;
                            }
                        }
                    }
                }
            }
            
            // Log overall processing summary
            const processingTime = Date.now() - startTime;
            logInfo('🏁 Webhook Processing Summary', {
                totalMessages: processedMessageCount + errorMessageCount,
                processedMessages: processedMessageCount,
                failedMessages: errorMessageCount,
                processingTimeMs: processingTime
            });

            // Meta requiere una respuesta 200 OK para los webhooks
            res.status(200).send('EVENT_RECEIVED');
        } else {
            console.log('⚠️ Unrecognized Webhook Object', {
                object: body.object,
                expectedObject: 'whatsapp_business_account'
            });

            logError('Unrecognized Webhook Object', { 
                object: body.object,
                expectedObject: 'whatsapp_business_account'
            });

            // Aún así devolvemos 200 para webhooks de Meta
            res.status(200).json({ 
                received: true,
                error: 'Invalid Object' 
            });
        }
    } catch (error) {
        const processingTime = Date.now() - startTime;

        console.error('🔥 Webhook Processing General Error', {
            error: error.message,
            processingTimeMs: processingTime,
            stack: error.stack
        });

        logError('General Webhook Error', {
            error: error.message,
            processingTimeMs: processingTime,
            stack: error.stack
        });

        // Siempre devolver 200 para webhook de Meta
        res.status(200).send('EVENT_RECEIVED');
    }
};

exports.getConversations = async (req, res) => {
    try {
        logInfo('📋 Requesting Conversations List');
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

        logInfo('📊 Sending Conversations List', {
            count: formattedConversations.length,
            activeConversations: formattedConversations.length
        });

        res.status(200).json(formattedConversations);
    } catch (error) {
        logError('❌ Error Retrieving Conversations', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Error retrieving conversations',
            message: error.message 
        });
    }
};

exports.getConversationAnalytics = async (req, res) => {
    try {
        logInfo('📈 Requesting Conversation Analytics');
        const analytics = await conversationService.getConversationAnalytics();
        
        logInfo('📊 Analytics Generated Successfully', {
            activeConversations: analytics.activeConversations,
            totalMessages: analytics.conversations.reduce((acc, conv) => acc + conv.messageCount, 0)
        });
        
        res.status(200).json(analytics);
    } catch (error) {
        logError('❌ Error Generating Analytics', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message 
        });
    }
};