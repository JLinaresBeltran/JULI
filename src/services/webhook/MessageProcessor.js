const { logInfo, logError } = require('../../utils/logger');
const welcomeHandlerService = require('../welcomeHandlerService');

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
    }

    async getConversation(userId) {
        return await this.conversationService.getConversation(userId);
    }

    async processMessage(messageData, context) {
        try {
            logInfo('Processing message', { 
                messageId: messageData.id,
                type: messageData.type,
                from: messageData.from
            });

            // 1. Verificar si es una nueva conversación ANTES de cualquier procesamiento
            const existingConversation = await this.conversationService.getConversation(messageData.from);
            const isFirstInteraction = !existingConversation;

            // 2. Si es primera interacción, enviar mensaje de bienvenida
            if (isFirstInteraction) {
                logInfo('First interaction detected, sending welcome message', { 
                    userId: messageData.from,
                    userName: context.contacts?.[0]?.profile?.name || 'Usuario'
                });

                await welcomeHandlerService.handleInitialInteraction(
                    messageData.from,
                    context.contacts?.[0]?.profile?.name || 'Usuario'
                );
            }

            // 3. Formatear y procesar el mensaje
            const formattedMessage = MessageFormatter.format(messageData);
            const conversation = await this.conversationService.processIncomingMessage(formattedMessage);
            
            // 4. Marcar como leído y notificar
            await this._handleReadReceipt(messageData);
            this._notifyWebSocket(conversation);
            
            // 5. Si aún no hay tipo de servicio definido y es un mensaje de texto
            if (conversation && !conversation.serviceType && messageData.type === 'text') {
                logInfo('Routing service for message', { 
                    userId: messageData.from,
                    message: messageData.text.body 
                });

                await welcomeHandlerService.routeToService(
                    messageData.from,
                    messageData.text.body
                );
            }

            return {
                conversation,
                isFirstInteraction
            };

        } catch (error) {
            logError('Message processing failed', {
                error: error.message,
                messageId: messageData.id,
                stack: error.stack
            });
            throw error;
        }
    }

    async _handleReadReceipt(messageData) {
        if (messageData.type === 'text') {
            try {
                await this.whatsappService.markAsRead(messageData.id);
                logInfo('Message marked as read', { messageId: messageData.id });
            } catch (error) {
                logError('Failed to mark message as read', {
                    error: error.message,
                    messageId: messageData.id
                });
            }
        }
    }

    _notifyWebSocket(conversation) {
        if (this.wsManager) {
            this.wsManager.broadcastConversationUpdate(conversation);
        }
    }
}

module.exports = MessageProcessor;