const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
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

    async processMessage(message, context) {
        try {
            logInfo('Processing message', {
                messageId: message.id,
                type: message.type,
                from: message.from
            });

            // 1. Verificar si es primera interacción
            const conversation = await this.conversationService.getConversation(message.from);
            const isFirstInteraction = !conversation;

            // 2. Si es primera interacción, enviar mensaje de bienvenida
            if (isFirstInteraction) {
                logInfo('First interaction detected, sending welcome message', {
                    userId: message.from,
                    userName: context.contacts?.[0]?.profile?.name
                });

                // Enviar mensaje de bienvenida antes de crear la conversación
                await welcomeHandlerService.handleInitialInteraction(
                    message.from,
                    context.contacts?.[0]?.profile?.name || 'Usuario'
                );

                // Crear la conversación después del mensaje de bienvenida
                await this.conversationService.createConversation(
                    message.from,
                    message.from
                );
            }

            // 3. Formatear el mensaje
            const formattedMessage = this.formatMessage(message, context);
            
            // 4. Procesar el mensaje
            const updatedConversation = await this.conversationService.processIncomingMessage(
                formattedMessage,
                { createIfNotExists: true }
            );

            // 5. Marcar como leído si es mensaje de texto
            if (message.type === 'text') {
                await this.whatsappService.markAsRead(message.id);
            }

            // 6. Notificar por WebSocket
            if (this.wsManager) {
                this.wsManager.broadcastConversationUpdate(updatedConversation);
            }

            return {
                success: true,
                isFirstInteraction,
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
}

module.exports = MessageProcessor;