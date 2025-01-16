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
            
            const formattedMessage = MessageFormatter.format(messageData);
            
            // Verificar si es primera interacción
            const existingConversation = await this.conversationService.getConversation(messageData.from);
            
            if (!existingConversation) {
                logInfo('New conversation detected', { userId: messageData.from });
                await welcomeHandlerService.handleInitialInteraction(
                    messageData.from,
                    context.contacts?.[0]?.profile?.name || 'Usuario'
                );
            } else if (!existingConversation.serviceType && messageData.type === 'text') {
                // Intentar identificar el servicio
                await welcomeHandlerService.routeToService(
                    messageData.from,
                    messageData.text.body
                );
            }
            
            const conversation = await this.conversationService.processIncomingMessage(formattedMessage);
            
            await this._handleReadReceipt(messageData);
            this._notifyWebSocket(conversation);
            
            return conversation;
        } catch (error) {
            logError('Message processing failed', { 
                error, 
                messageId: messageData.id 
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
                    error, 
                    messageId: messageData.id 
                });
            }
        }
    }

    _notifyWebSocket(conversation) {
        this.wsManager.broadcastConversationUpdate(conversation);
    }
}

module.exports = MessageProcessor;