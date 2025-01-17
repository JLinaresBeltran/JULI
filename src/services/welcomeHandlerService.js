const whatsappService = require('./whatsappService');
const { logInfo, logError } = require('../utils/logger');

class WelcomeHandlerService {
    async handleInitialInteraction(userId, userName, context) {
        try {
            logInfo('Sending welcome message', {
                userId,
                userName,
                context: 'handleInitialInteraction',
                conversationOrigin: context?.conversation?.origin?.type
            });

            const welcomeMessage = {
                type: 'text',
                text: { 
                    body: this.getWelcomeMessage(userName)
                }
            };

            const response = await whatsappService.sendMessage(userId, welcomeMessage);

            logInfo('Welcome message sent successfully', {
                userId,
                userName,
                messageId: response?.messages?.[0]?.id
            });

            return {
                success: true,
                messageId: response?.messages?.[0]?.id,
                message: welcomeMessage,
                timestamp: new Date().toISOString(),
                metadata: {
                    userId,
                    userName,
                    conversationOrigin: context?.conversation?.origin?.type || 'unknown',
                    messageType: 'welcome_message'
                }
            };

        } catch (error) {
            logError('Failed to send welcome message', {
                error: error.message,
                userId,
                userName,
                stack: error.stack,
                context: 'handleInitialInteraction'
            });
            throw error;
        }
    }

    async handleUserStartedConversation(userId, context) {
        try {
            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
            
            logInfo('User started conversation', {
                userId,
                userName,
                conversationType: context?.conversation?.origin?.type,
                timestamp: new Date().toISOString()
            });

            return this.handleInitialInteraction(userId, userName, context);
        } catch (error) {
            logError('Failed to handle conversation start', {
                error: error.message,
                userId,
                context,
                stack: error.stack
            });
            throw error;
        }
    }

    isConversationStart(context) {
        return (
            context?.contacts?.[0]?.wa_id &&
            !context.messages && // No hay mensajes aún
            context?.conversation?.origin?.type === 'user_initiated'
        );
    }

    getWelcomeMessage(userName) {
        return `¡Hola ${userName}! 👋\n\nSoy JULI, tu asistente legal virtual personalizada ✨\n\nMe especializo en brindarte orientación sobre:\n🏠 Servicios públicos\n📱 Telecomunicaciones\n✈️ Transporte aéreo\n\nCuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`;
    }
}

module.exports = new WelcomeHandlerService();