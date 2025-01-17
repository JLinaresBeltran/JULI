const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
    }

    async processMessage(message, context) {
        try {
            logInfo('Processing message', {
                messageId: message.id,
                type: message.type,
                from: message.from
            });

            // 1. Obtener la conversación
            const conversation = await this.conversationService.getConversation(message.from);
            const isFirstInteraction = !conversation;
            
            // 2. Si es primera interacción, enviar mensaje de bienvenida
            if (isFirstInteraction) {
                await this._handleFirstInteraction(message, context);
                return {
                    success: true,
                    isFirstInteraction: true
                };
            }

            // 3. Si es la primera respuesta después del mensaje de bienvenida
            if (conversation && !conversation.category && message.type === 'text') {
                await this._handleCategoryClassification(message, conversation);
            }

            // 4. Procesar el mensaje normalmente
            const formattedMessage = this.formatMessage(message, context);
            const updatedConversation = await this.conversationService.processIncomingMessage(
                formattedMessage,
                { createIfNotExists: true }
            );

            // 5. Procesar el mensaje con Chatbase si ya está clasificado
            if (updatedConversation.category && message.type === 'text') {
                await this._forwardToChatbase(message.text.body, updatedConversation.category);
            }

            // 6. Marcar como leído si es mensaje de texto
            if (message.type === 'text') {
                await this.whatsappService.markAsRead(message.id);
            }

            // 7. Notificar por WebSocket
            if (this.wsManager) {
                this.wsManager.broadcastConversationUpdate(updatedConversation);
            }

            return {
                success: true,
                isFirstInteraction: false,
                conversation: updatedConversation
            };

        } catch (error) {
            logError('Failed to process message', {
                error: error.message,
                messageId: message.id,
                stack: error.stack
            });
            throw error;
        }
    }

    async _handleFirstInteraction(message, context) {
        logInfo('First interaction detected, sending welcome message', {
            userId: message.from,
            userName: context.contacts?.[0]?.profile?.name
        });

        await welcomeHandlerService.handleInitialInteraction(
            message.from,
            context.contacts?.[0]?.profile?.name || 'Usuario'
        );

        await this.conversationService.createConversation(
            message.from,
            message.from
        );
    }

    async _handleCategoryClassification(message, conversation) {
        try {
            // Clasificar el mensaje
            const classification = queryClassifierService.classifyQuery(message.text.body);
            
            // Actualizar la conversación con la categoría
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

            // Enviar mensaje de confirmación al usuario
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
                json: () => {} // Mock response object
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