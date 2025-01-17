const whatsappService = require('./whatsappService');
const { logInfo, logError } = require('../utils/logger');

class WelcomeHandlerService {
    async handleInitialInteraction(userId, userName, context = {}) {
        try {
            logInfo('Starting initial interaction', {
                userId,
                userName,
                context: {
                    type: context?.conversation?.origin?.type,
                    id: context?.conversation?.id,
                    hasMessages: !!context?.messages
                }
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
                messageId: response?.messages?.[0]?.id,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                messageId: response?.messages?.[0]?.id,
                message: welcomeMessage,
                metadata: {
                    userId,
                    userName,
                    conversationId: context?.conversation?.id,
                    initiationType: context?.conversation?.origin?.type || 'unknown',
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            logError('Welcome message failed', {
                error: error.message,
                userId,
                userName,
                context: {
                    type: context?.conversation?.origin?.type,
                    id: context?.conversation?.id
                },
                stack: error.stack
            });
            throw error;
        }
    }

    async handleConversationStart(userId, context) {
        try {
            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
            logInfo('Conversation start detected', {
                userId,
                userName,
                context: {
                    type: context?.conversation?.origin?.type,
                    id: context?.conversation?.id
                }
            });

            return this.handleInitialInteraction(userId, userName, context);
        } catch (error) {
            logError('Conversation start handling failed', {
                error: error.message,
                userId,
                context: {
                    type: context?.conversation?.origin?.type,
                    id: context?.conversation?.id
                },
                stack: error.stack
            });
            throw error;
        }
    }

    getWelcomeMessage(userName) {
        return `¡Hola ${userName}! 👋\n\nSoy JULI, tu asistente legal virtual personalizada ✨\n\nMe especializo en brindarte orientación sobre:\n🏠 Servicios públicos\n📱 Telecomunicaciones\n✈️ Transporte aéreo\n\nCuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`;
    }

    isValidWelcomeResponse(response) {
        return !!(response?.messages?.[0]?.id);
    }

    isConversationStart(context) {
        return (
            context?.contacts?.[0]?.wa_id &&
            context?.conversation?.origin?.type === 'user_initiated' &&
            !context.messages // No hay mensajes todavía
        );
    }
}

module.exports = new WelcomeHandlerService();