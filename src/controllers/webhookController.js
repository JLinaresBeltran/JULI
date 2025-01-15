// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const WebSocketManager = require('../services/websocketService');
const { logInfo, logError } = require('../utils/logger');

class WebhookController {
    constructor() {
        try {
            this.wsManager = WebSocketManager.getInstance();
        } catch (error) {
            logError('Error initializing WebhookController', {
                error: error.message || 'Unknown error'
            });
            // Fallback para el wsManager
            this.wsManager = {
                broadcast: () => {},
                broadcastConversationUpdate: () => {},
                broadcastConversations: () => {}
            };
        }
    }

    async verifyWebhook(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

        logInfo('Webhook verification request received', {
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
    }

    async receiveMessage(req, res) {
        try {
            logInfo('Webhook payload received', { body: req.body });

            if (!this._validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload structure');
            }

            await this._processWebhookPayload(req.body);
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Error processing webhook', { error: error.message });
            // Siempre retornamos 200 para webhooks de WhatsApp
            return res.status(200).send('EVENT_RECEIVED');
        }
    }

    _validateWebhookPayload(body) {
        return body && 
               body.object === 'whatsapp_business_account' && 
               Array.isArray(body.entry);
    }

    async _processWebhookPayload(body) {
        for (const entry of body.entry) {
            if (entry.changes) {
                for (const change of entry.changes) {
                    if (change.value?.messages) {
                        await this._processMessages(change.value.messages, change.value);
                    }
                }
            }
        }
    }

    async _processMessages(messages, context) {
        for (const message of messages) {
            try {
                logInfo('Processing message', {
                    messageId: message.id,
                    type: message.type,
                    from: message.from
                });

                const formattedMessage = this._formatMessage(message, context);
                const conversation = await conversationService.processIncomingMessage(formattedMessage);

                // Marcar como leído si es mensaje de texto
                if (message.type === 'text') {
                    try {
                        await whatsappService.markAsRead(message.id);
                        logInfo('Message marked as read', { messageId: message.id });
                    } catch (error) {
                        logError('Error marking message as read', {
                            messageId: message.id,
                            error: error.message
                        });
                    }
                }

                // Notificar a través de WebSocket
                if (this.wsManager) {
                    this.wsManager.broadcastConversationUpdate(conversation);
                    this.wsManager.broadcastConversations();
                }

                logInfo('Message processed successfully', {
                    messageId: message.id,
                    conversationId: conversation.id || conversation.whatsappId
                });

            } catch (error) {
                logError('Error processing individual message', {
                    messageId: message.id,
                    error: error.message
                });
            }
        }
    }

    _formatMessage(message, context) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            text: message.text?.body || '',
            audio: message.audio?.id,
            direction: 'inbound',
            status: 'received',
            profile: context.contacts?.[0],
            metadata: {
                displayPhoneNumber: context.metadata?.display_phone_number,
                phoneNumberId: context.metadata?.phone_number_id
            }
        };
    }

    async getConversations(req, res) {
        try {
            logInfo('Requesting conversations list');
            
            const conversations = await conversationService.getAllConversations();
            
            logInfo('Conversations retrieved successfully', {
                count: conversations.length
            });

            return res.status(200).json(conversations);
        } catch (error) {
            logError('Error retrieving conversations', { error: error.message });
            return res.status(500).json({
                error: 'Error retrieving conversations',
                message: error.message
            });
        }
    }

    async handleHeartbeat(req, res) {
        try {
            const { conversationId } = req.body;
            
            if (!conversationId) {
                logError('Missing conversationId in heartbeat request');
                return res.status(400).json({ 
                    error: 'ConversationId is required' 
                });
            }

            await conversationService.updateConversationHeartbeat(conversationId);
            logInfo('Heartbeat updated successfully', { conversationId });
            
            return res.status(200).json({
                status: 'success',
                timestamp: new Date()
            });
        } catch (error) {
            logError('Heartbeat error', { error: error.message });
            return res.status(400).json({ error: error.message });
        }
    }
}

// Exportar una única instancia del controlador
module.exports = new WebhookController();