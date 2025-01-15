// src/services/webhook/MessageProcessor.js
class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
    }

    async processMessage(messageData) {
        try {
            logInfo('Processing message', { messageId: messageData.id });
            
            const formattedMessage = MessageFormatter.format(messageData);
            const conversation = await this.conversationService.processIncomingMessage(formattedMessage);
            
            await this._handleReadReceipt(messageData);
            this._notifyWebSocket(conversation);
            
            return conversation;
        } catch (error) {
            logError('Message processing failed', { error, messageId: messageData.id });
            throw error;
        }
    }

    async _handleReadReceipt(messageData) {
        if (messageData.type === 'text') {
            try {
                await this.whatsappService.markAsRead(messageData.id);
                logInfo('Message marked as read', { messageId: messageData.id });
            } catch (error) {
                logError('Failed to mark message as read', { error, messageId: messageData.id });
            }
        }
    }

    _notifyWebSocket(conversation) {
        this.wsManager.broadcastConversationUpdate(conversation);
    }
}