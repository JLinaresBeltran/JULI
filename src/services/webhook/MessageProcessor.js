const { logInfo, logError } = require('../../utils/logger');
const welcomeHandlerService = require('../welcomeHandlerService');

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
    }

    async processMessage(messageData, context) {
        try {
            logInfo('Processing message', { messageId: messageData.id });

            // 1. Formatear el mensaje
            const formattedMessage = MessageFormatter.format(messageData);
            
            // 2. Verificar si es una nueva conversación
            const existingConversation = await this.conversationService.getConversation(messageData.from);
            if (!existingConversation) {
                logInfo('Sending welcome message for new conversation', { 
                    userId: messageData.from,
                    userName: context.contacts?.[0]?.profile?.name || 'Usuario'
                });

                // Enviar mensaje de bienvenida antes de procesar el mensaje
                await welcomeHandlerService.handleInitialInteraction(
                    messageData.from,
                    context.contacts?.[0]?.profile?.name || 'Usuario'
                );
            }

            // 3. Procesar el mensaje en la conversación
            const conversation = await this.conversationService.processIncomingMessage(formattedMessage);
            
            // 4. Si aún no hay tipo de servicio definido y es un mensaje de texto
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

            // 5. Manejar marcado de lectura y notificaciones
            await this._handleReadReceipt(messageData);
            this._notifyWebSocket(conversation);
            
            return conversation;

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