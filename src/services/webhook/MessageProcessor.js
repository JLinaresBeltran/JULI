// src/services/webhook/MessageProcessor.js
const { logInfo, logError } = require('../../utils/logger');

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
            logInfo('Processing incoming message', {
                messageId: message.id,
                type: message.type,
                from: message.from
            });

            // 1. Obtener o crear conversación
            let conversation = await this._getOrCreateConversation(message, context);

            // 2. Validar mensaje duplicado
            if (this._isDuplicateMessage(conversation, message)) {
                logInfo('Duplicate message detected', { messageId: message.id });
                return { success: true, status: 'DUPLICATE' };
            }

            // 3. Procesar mensaje según el estado de la conversación
            const result = await this._processMessageByState(message, conversation, context);

            // 4. Actualizar WebSocket si está disponible
            this._updateWebSocket(conversation);

            return result;

        } catch (error) {
            logError('Error processing message', {
                error: error.message,
                messageId: message?.id,
                stack: error.stack
            });
            throw error;
        }
    }

    async _getOrCreateConversation(message, context) {
        let conversation = await this.conversationService.getConversation(message.from);
        
        if (!conversation) {
            conversation = await this.conversationService.createConversation(
                message.from,
                message.from
            );
            await this._handleNewConversation(conversation, context);
        }

        return conversation;
    }

    async _handleNewConversation(conversation, context) {
        const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
        
        await this.whatsappService.sendTextMessage(
            conversation.whatsappId,
            `¡Hola ${userName}! Soy JULI, tu asistente legal virtual. ¿En qué puedo ayudarte hoy?`
        );

        await this.conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                userName,
                status: 'active',
                stage: 'welcome',
                firstInteraction: new Date().toISOString()
            }
        );
    }

    _isDuplicateMessage(conversation, message) {
        return conversation.messages.some(m => m.id === message.id);
    }

    async _processMessageByState(message, conversation, context) {
        // Si es el primer mensaje después de bienvenida, activar clasificación
        if (conversation.messages.length === 1 && message.type === 'text') {
            await this._handleFirstUserMessage(message, conversation);
            return { success: true, status: 'FIRST_MESSAGE_PROCESSED' };
        }

        // Procesar mensaje normal
        await this._processNormalMessage(message, conversation, context);
        return { success: true, status: 'MESSAGE_PROCESSED' };
    }

    async _handleFirstUserMessage(message, conversation) {
        await this.conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                stage: 'classification',
                awaitingClassification: true
            }
        );

        // Agregar mensaje a la conversación
        await this.conversationService.processIncomingMessage(message);

        // Marcar como leído
        if (message.type === 'text' || message.type === 'audio') {
            await this.whatsappService.markAsRead(message.id);
        }
    }

    async _processNormalMessage(message, conversation, context) {
        // Procesar clasificación si es necesario
        if (conversation.metadata?.awaitingClassification && message.type === 'text') {
            await this._handleClassification(message, conversation);
        }

        // Agregar mensaje a la conversación
        await this.conversationService.processIncomingMessage(message);

        // Marcar como leído
        if (message.type === 'text' || message.type === 'audio') {
            await this.whatsappService.markAsRead(message.id);
        }
    }

    async _handleClassification(message, conversation) {
        const classification = await this.conversationService.classifyMessage(message);
        
        if (classification.category !== 'unknown') {
            await this._sendCategoryConfirmation(conversation.whatsappId, classification.category);
            await this._processChatbaseResponse(message, classification.category);
        }

        await this.conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                stage: 'conversation',
                awaitingClassification: false,
                category: classification.category,
                classificationConfidence: classification.confidence
            }
        );
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

    async _processChatbaseResponse(message, category) {
        try {
            const response = await this.chatbaseController[`handle${this._formatCategory(category)}`](
                message.text.body
            );

            if (response?.text) {
                await this.whatsappService.sendTextMessage(message.from, response.text);
            }
        } catch (error) {
            logError('Error processing Chatbase response', { error: error.message });
        }
    }

    _updateWebSocket(conversation) {
        if (this.wsManager) {
            this.wsManager.broadcastConversationUpdate(conversation);
        }
    }

    _formatCategory(category) {
        return category.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }
}

module.exports = MessageProcessor;