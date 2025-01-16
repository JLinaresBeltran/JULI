class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager, welcomeHandlerService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
        this.welcomeHandlerService = welcomeHandlerService;
    }

    async processMessage(messageData, context) {
        try {
            logInfo('Processing message', { messageId: messageData.id });
            
            const formattedMessage = MessageFormatter.format(messageData);
            
            // Verificar estado de la conversación
            const existingConversation = await this.conversationService.getConversationByUserId(messageData.from);
            const isFirstInteraction = !existingConversation;

            // Manejar mensaje de bienvenida si es necesario
            if (isFirstInteraction && formattedMessage.type === 'text') {
                await this._handleWelcomeMessage(messageData, context);
            }
            // Manejar enrutamiento si no hay servicio definido
            else if (!existingConversation?.serviceType && formattedMessage.type === 'text') {
                await this._handleServiceRouting(messageData, context);
            }

            // Procesar el mensaje en la conversación
            const conversation = await this.conversationService.processIncomingMessage(formattedMessage);
            
            await this._handleReadReceipt(messageData);
            this._notifyWebSocket(conversation);
            
            return conversation;
        } catch (error) {
            logError('Message processing failed', { error, messageId: messageData.id });
            throw error;
        }
    }

    async _handleWelcomeMessage(messageData, context) {
        try {
            const welcomeMessage = await this.welcomeHandlerService.handleInitialInteraction(
                messageData.from,
                context.contacts?.[0]?.profile?.name || 'Usuario'
            );

            await this.whatsappService.sendMessage(
                welcomeMessage,
                messageData.from,
                context.metadata.phone_number_id
            );

            logInfo('Welcome message sent', { userId: messageData.from });
        } catch (error) {
            logError('Failed to send welcome message', { error, userId: messageData.from });
            throw error;
        }
    }

    async _handleServiceRouting(messageData, context) {
        try {
            const response = await this.welcomeHandlerService.routeToService(
                messageData.from,
                messageData.text.body
            );

            if (response) {
                await this.whatsappService.sendMessage(
                    response,
                    messageData.from,
                    context.metadata.phone_number_id
                );
            }

            logInfo('Service routing handled', { userId: messageData.from });
        } catch (error) {
            logError('Failed to handle service routing', { error, userId: messageData.from });
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