// src/controllers/webhookController.js
const MessageProcessor = require('../services/webhook/MessageProcessor');
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const welcomeHandlerService = require('../services/welcomeHandlerService');
const WebSocketManager = require('../services/websocketService');
const legalAgentSystem = require('../services/legalAgents');
const documentService = require('../services/documentService');
const { logInfo, logError } = require('../utils/logger');

// Constants for document request triggers
const DOCUMENT_TRIGGERS = [
    "juli quiero el documento",
    "quiero el documento",
    "necesito el documento",
    "generar documento",
    "genera el documento",
    "documento por favor"
];

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

    // Validation Methods
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

            return isValidPhoneNumber;
        } catch (error) {
            logError('Message validation error', { error: error.message });
            return false;
        }
    }

    // Main Controller Methods
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

        const isNewConversation = !(await conversationService.getConversation(message.from));
        if (isNewConversation) {
            await this._handleNewUserWelcome(message.from, change.value);
        }

        const conversation = await conversationService.getConversation(message.from);

        // Check if it's a document request
        if (this._isDocumentRequest(message)) {
            const documentResult = await this._handleDocumentRequest(message, conversation, context);
            this._addResult(results, message, 'success', documentResult);
            return;
        }

        await this.messageProcessor.processMessage(message, context);
        this._broadcastUpdates(conversation);
        this._addResult(results, message, 'success', { type: 'MESSAGE_PROCESSED' });
    }

    _isDocumentRequest(message) {
        if (message.type !== 'text') return false;
        const normalizedText = message.text.body.toLowerCase().trim();
        return DOCUMENT_TRIGGERS.some(trigger => normalizedText.includes(trigger));
    }

    async _handleDocumentRequest(message, conversation, context) {
        try {
            logInfo('Starting document request process', {
                whatsappId: message.from,
                category: conversation?.category
            });

            // Verify if waiting for email
            if (conversation?.metadata?.awaitingEmail) {
                return this._handleEmailSubmission(message, conversation);
            }

            // Verify valid category
            if (!this._validateConversationForDocument(conversation)) {
                await this._sendInvalidConversationMessage(message.from);
                return { success: false, type: 'INVALID_CATEGORY' };
            }

            // Request email if not available
            await conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    awaitingEmail: true,
                    documentRequestPending: true
                }
            );

            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
            );

            return { success: true, type: 'EMAIL_REQUESTED' };
        } catch (error) {
            logError('Error handling document request', { error });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _handleEmailSubmission(message, conversation) {
        const email = message.text.body.trim();
        if (!this._isValidEmail(email)) {
            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "El correo electrónico no es válido. Por favor, ingresa un correo válido."
            );
            return { success: true, type: 'INVALID_EMAIL' };
        }

        return await this._generateDocument(conversation, email);
    }

    async _generateDocument(conversation, email) {
        try {
            const category = conversation.category || conversation.metadata?.category;
            const customerData = this._prepareCustomerData(conversation, email);

            const result = await legalAgentSystem.processComplaint(
                category,
                conversation.getMessages(),
                customerData
            );

            await documentService.generateDocument(
                category,
                result,
                customerData
            );

            await conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString(),
                    email: email,
                    awaitingEmail: false,
                    documentRequestPending: false
                }
            );

            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return { success: true, type: 'DOCUMENT_GENERATED' };
        } catch (error) {
            logError('Error generating document', { error });
            throw error;
        }
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

    _validateConversationForDocument(conversation) {
        if (!conversation) return false;
        const category = conversation.category || conversation.metadata?.category;
        return category && category !== 'unknown';
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    _prepareCustomerData(conversation, email) {
        return {
            name: conversation.metadata?.customerName || 'Usuario',
            documentNumber: conversation.metadata?.documentNumber,
            email: email,
            phone: conversation.whatsappId,
            address: conversation.metadata?.address || 'No especificado',
            ...this._getServiceSpecificData(conversation)
        };
    }

    _getServiceSpecificData(conversation) {
        const metadata = conversation.metadata || {};
        const category = conversation.category || metadata.category;

        const dataMap = {
            'servicios_publicos': {
                cuenta_contrato: metadata.accountNumber,
                tipo_servicio: metadata.serviceType,
                periodo_facturacion: metadata.billingPeriod
            },
            'telecomunicaciones': {
                numero_linea: metadata.lineNumber,
                plan_contratado: metadata.plan,
                fecha_contratacion: metadata.contractDate
            },
            'transporte_aereo': {
                numero_reserva: metadata.reservationNumber,
                numero_vuelo: metadata.flightNumber,
                fecha_vuelo: metadata.flightDate,
                ruta: metadata.route,
                valor_tiquete: metadata.ticketValue
            }
        };

        return dataMap[category] || {};
    }

    async _sendInvalidConversationMessage(whatsappId) {
        await whatsappService.sendTextMessage(
            whatsappId,
            "Para generar el documento de reclamación, necesito que primero me cuentes tu caso para poder ayudarte adecuadamente."
        );
    }

    async _sendErrorMessage(whatsappId) {
        await whatsappService.sendTextMessage(
            whatsappId,
            "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
        );
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

    // Analytics Methods
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

// Create singleton instance
const webhookController = new WebhookController();

// Export controller methods with proper binding
module.exports = {
    receiveMessage: webhookController.receiveMessage.bind(webhookController),
    getConversations: webhookController.getConversations.bind(webhookController),
    getConversationAnalytics: webhookController.getConversationAnalytics.bind(webhookController)
};