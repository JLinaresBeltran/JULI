const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');

const DOCUMENT_TRIGGER = "juli quiero el documento";

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
    }

    async processMessage(message, context) {
        try {
            logInfo('Processing message', {
                messageId: message.id,
                type: message.type,
                from: message.from
            });

            const conversation = await this.conversationService.getConversation(message.from);
            
            // Primera interacción
            if (!conversation) {
                return this._handleFirstInteraction(message, context);
            }

            // Validar trigger de documento primero
            const isDocumentRequest = message.type === 'text' && message.text?.body?.toLowerCase().trim() === DOCUMENT_TRIGGER;
            if (isDocumentRequest) {
                logInfo('Document request detected', {
                    whatsappId: conversation.whatsappId,
                    category: conversation.category
                });
                return this._handleDocumentRequest(conversation, context);
            }

            // Flujo normal de mensaje
            return this._processNormalMessage(message, context, conversation);
        } catch (error) {
            logError('Failed to process message', { error });
            throw error;
        }
    }


    async _processDocumentRequest(conversation, context) {
        if (!conversation?.category) {
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Para generar el documento, primero necesito entender tu caso. Por favor, cuéntame tu situación."
            );
            return { success: false, reason: 'no_category' };
        }

        return this._handleDocumentRequest(conversation, context);
    }

    _isDocumentRequest(message) {
        if (!message?.type === 'text' || !message?.text?.body) return false;
        return message.text.body.toLowerCase().trim() === DOCUMENT_TRIGGER;
    }

    async _processNormalMessage(message, context, conversation) {
        const formattedMessage = this.formatMessage(message, context);
        
        const updatedConversation = await this.conversationService.processIncomingMessage(
            formattedMessage,
            { createIfNotExists: true }
        );

        if (message.type === 'text') {
            if (updatedConversation.category) {
                await this._forwardToChatbase(message.text.body, updatedConversation.category);
            }
            await this.whatsappService.markAsRead(message.id);
        }

        if (this.wsManager) {
            this.wsManager.broadcastConversationUpdate(updatedConversation);
        }

        return {
            success: true,
            isFirstInteraction: false,
            conversation: updatedConversation
        };
    }

    async _handleDocumentRequest(conversation, context) {
        try {
            logInfo('Processing document request', {
                whatsappId: conversation.whatsappId,
                category: conversation.category
            });

            const customerData = {
                name: context.contacts?.[0]?.profile?.name,
                documentNumber: conversation.metadata?.documentNumber,
                email: conversation.metadata?.email,
                phone: conversation.from,
                address: conversation.metadata?.address
            };

            const missingFields = this._validateCustomerData(customerData);
            if (missingFields.length > 0) {
                const message = `Para generar el documento necesito los siguientes datos: ${missingFields.join(', ')}`;
                await this.whatsappService.sendTextMessage(conversation.whatsappId, message);
                return {
                    success: false,
                    missingFields
                };
            }

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estoy procesando tu solicitud para generar el documento. Esto puede tomar unos momentos."
            );

            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            await this.documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Listo! Tu documento ha sido generado y enviado a tu correo electrónico."
            );

            logInfo('Document generated successfully', {
                whatsappId: conversation.whatsappId,
                category: conversation.category,
                customerEmail: customerData.email
            });

            return {
                success: true,
                documentGenerated: true
            };

        } catch (error) {
            logError('Error generating document', {
                error: error.message,
                whatsappId: conversation.whatsappId,
                stack: error.stack
            });
            
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Lo siento, hubo un problema generando el documento. Por favor intenta nuevamente más tarde."
            );
            throw error;
        }
    }

    _validateCustomerData(customerData) {
        const requiredFields = ['name', 'documentNumber', 'email', 'address'];
        return requiredFields.filter(field => !customerData[field]);
    }

    async _handleFirstInteraction(message, context) {
        logInfo('First interaction detected', {
            userId: message.from,
            userName: context.contacts?.[0]?.profile?.name
        });

        await welcomeHandlerService.handleInitialInteraction(
            message.from,
            context.contacts?.[0]?.profile?.name || 'Usuario'
        );

        const conversation = await this.conversationService.createConversation(
            message.from,
            message.from
        );

        if (this.wsManager) {
            this.wsManager.broadcastConversationUpdate(conversation);
        }

        return {
            success: true,
            isFirstInteraction: true,
            conversation
        };
    }

    async _handleCategoryClassification(message, conversation) {
        try {
            const classification = queryClassifierService.classifyQuery(message.text.body);
            
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                { 
                    category: classification.category,
                    classificationConfidence: classification.confidence 
                }
            );

            logInfo('Conversation categorized', {
                whatsappId: conversation.whatsappId,
                category: classification.category,
                confidence: classification.confidence
            });

            await this._sendCategoryConfirmation(
                conversation.whatsappId, 
                classification.category
            );

            return classification;

        } catch (error) {
            logError('Error in category classification', {
                error: error.message,
                messageId: message.id,
                conversationId: conversation.whatsappId
            });
            throw error;
        }
    }

    async _sendCategoryConfirmation(whatsappId, category) {
        const messages = {
            servicios_publicos: '🏠 Te ayudaré con tu consulta sobre servicios públicos.',
            telecomunicaciones: '📱 Te ayudaré con tu consulta sobre telecomunicaciones.',
            transporte_aereo: '✈️ Te ayudaré con tu consulta sobre transporte aéreo.'
        };

        const message = messages[category] || 'Entiendo tu consulta. ¿En qué puedo ayudarte?';
        await this.whatsappService.sendTextMessage(whatsappId, message);
    }

    async _forwardToChatbase(message, category) {
        try {
            await chatbaseController[`handle${this._formatCategory(category)}`]({
                body: { message }
            }, {
                json: () => {}
            });
        } catch (error) {
            logError('Error forwarding to Chatbase', {
                error: error.message,
                category
            });
        }
    }

    _formatCategory(category) {
        return category.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    formatMessage(message, context = {}) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            content: message.text?.body || '',
            metadata: {
                ...context.metadata,
                profile: context.contacts?.[0]?.profile
            }
        };
    }
}

module.exports = MessageProcessor;