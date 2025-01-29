// src/controllers/webhookController.js
const MessageProcessor = require('../services/webhook/MessageProcessor');
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const welcomeHandlerService = require('../services/welcomeHandlerService');
const WebSocketManager = require('../services/websocketService');
const legalAgentSystem = require('../services/legalAgents');
const documentService = require('../services/documentService');
const { logInfo, logError } = require('../utils/logger');

class WebhookController {
    constructor() {
        this.messageProcessor = new MessageProcessor(
            conversationService,
            whatsappService,
            WebSocketManager.getInstance(),
            legalAgentSystem,
            documentService
        );
    }

    validateWebhookPayload(body) {
        return body?.object === 'whatsapp_business_account' && Array.isArray(body?.entry);
    }

    validateMessage(message, context) {
        try {
            const isValidStructure = message?.id && message?.from && message?.timestamp;
            const isValidContext = context?.metadata && context?.contacts;
            const isValidPhoneNumber = /^[0-9]{10,15}$/.test(message?.from);

            if (!isValidStructure || !isValidContext) {
                logError('Invalid message or context structure');
                return false;
            }

            switch (message.type) {
                case 'text':
                    return Boolean(message.text?.body);
                case 'audio':
                    return Boolean(message.audio?.id);
                default:
                    return true;
            }
        } catch (error) {
            logError('Message validation error', { error: error.message });
            return false;
        }
    }

    async receiveMessage(req, res) {
        try {
            logInfo('API Request: POST /webhook', {
                headers: req.headers['x-forwarded-for'] || req.ip,
                timestamp: new Date().toLocaleTimeString()
            });

            if (!this.validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload');
            }

            const results = await this._processWebhookEntries(req.body.entry);
            
            logInfo('Webhook processed', { results });
            return res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Webhook error', { error });
            return res.status(200).send('EVENT_RECEIVED');
        }
    }

    async _processWebhookEntries(entries) {
        const results = { processed: 0, errors: 0, details: [] };

        for (const entry of entries) {
            for (const change of entry.changes) {
                try {
                    await this._processWebhookChange(change, results);
                } catch (error) {
                    logError('Error processing change', { error: error.message });
                    if (change.value?.messages?.[0]) {
                        this._addResult(results, change.value.messages[0], 'error', { error });
                    }
                }
            }
        }

        return results;
    }

    async _processWebhookChange(change, results) {
        if (this._isSystemConversationStart(change)) {
            const userId = change.value.contacts[0].wa_id;
            await this._handleNewUserWelcome(userId, change.value);
            results.processed++;
            return;
        }

        if (change.value?.messages?.length > 0) {
            await this._processIncomingMessage(change, results);
        }
    }

    async _processIncomingMessage(change, results) {
        const message = change.value.messages[0];
        const context = {
            metadata: change.value.metadata,
            contacts: change.value.contacts
        };
    
        if (!this.validateMessage(message, context)) {
            throw new Error('Invalid message format');
        }
    
        const conversation = await conversationService.getConversation(message.from);
        
        if (conversation && this._checkDuplicateMessage(conversation, message)) {
            logInfo('Duplicate message detected and skipped', { messageId: message.id });
            return;
        }
    
        if (!conversation) {
            await this._handleNewUserWelcome(message.from, change.value);
        }
    
        const updatedConversation = await conversationService.getConversation(message.from);
    
        // Procesar mensaje usando MessageProcessor
        const processingResult = await this.messageProcessor.processMessage(message, context);
        this._broadcastUpdates(updatedConversation);
        this._addResult(results, message, 'success', processingResult);
    }

    _checkDuplicateMessage(conversation, message) {
        return conversation.messages.some(m => m.id === message.id);
    }

    _isSystemConversationStart(change) {
        return (
            change.field === "messages" &&
            change.value?.contacts?.[0] &&
            !change.value.messages &&
            !!change.value?.contacts?.[0]?.wa_id &&
            change.value?.event === 'system_customer_welcome'
        );
    }

    async _handleNewUserWelcome(userId, context) {
        try {
            logInfo('Iniciando manejo de nuevo usuario', {
                userId,
                contextType: context?.event || 'message'
            });

            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
            let conversation = await conversationService.getConversation(userId);
            
            if (!conversation) {
                conversation = await this._createNewConversation(userId, userName, context);
            }

            return conversation;
        } catch (error) {
            logError('Welcome flow error', { error: error.message });
            throw error;
        }
    }

    async _createNewConversation(userId, userName, context) {
        const conversation = await conversationService.createConversation(userId, userId);
        
        logInfo('Nueva conversación creada', {
            whatsappId: userId,
            userPhoneNumber: userId,
            context: 'createConversation'
        });

        await welcomeHandlerService.handleInitialInteraction(userId, userName, {
            ...context,
            conversation: {
                id: userId,
                isNew: true
            }
        });

        this._broadcastUpdates(conversation);
        return conversation;
    }

    _addResult(results, message, status, details) {
        results[status === 'success' ? 'processed' : 'errors']++;
        results.details.push({
            id: message.id,
            status,
            type: message.type,
            ...details
        });
    }

    _broadcastUpdates(conversation) {
        const wsManager = WebSocketManager.getInstance();
        if (wsManager) {
            wsManager.broadcastConversationUpdate(conversation);
            wsManager.broadcastConversations();
        }
    }

    async getConversations(req, res) {
        try {
            const conversations = await conversationService.getAllConversations();
            return res.status(200).json(conversations);
        } catch (error) {
            logError('Conversations retrieval error', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            return res.status(200).json(analytics);
        } catch (error) {
            logError('Analytics error', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }
}

const webhookController = new WebhookController();

module.exports = {
    receiveMessage: webhookController.receiveMessage.bind(webhookController),
    getConversations: webhookController.getConversations.bind(webhookController),
    getConversationAnalytics: webhookController.getConversationAnalytics.bind(webhookController)
};