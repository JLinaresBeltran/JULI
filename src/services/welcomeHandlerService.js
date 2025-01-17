const whatsappService = require('./whatsappService');
const { logInfo, logError } = require('../utils/logger');

class WelcomeHandlerService {
    async handleInitialInteraction(userId, userName) {
        try {
            logInfo('Sending welcome message', {
                userId,
                userName,
                context: 'handleInitialInteraction'
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

            // Retornar un objeto con la información completa
            return {
                success: true,
                messageId: response?.messages?.[0]?.id,
                message: welcomeMessage,
                timestamp: new Date().toISOString(),
                metadata: {
                    userId,
                    userName,
                    type: 'welcome_message'
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

            // Propagar el error con más contexto
            throw new Error(`Failed to send welcome message: ${error.message}`);
        }
    }

    async handleConversationStart(userId, context) {
        try {
            logInfo('Handling conversation start', {
                userId,
                hasProfile: !!context?.contacts?.[0]?.profile
            });

            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
            return this.handleInitialInteraction(userId, userName);

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

    getWelcomeMessage(userName) {
        return `¡Hola ${userName}! 👋\n\nSoy JULI, tu asistente legal virtual personalizada ✨\n\nMe especializo en brindarte orientación sobre:\n🏠 Servicios públicos\n📱 Telecomunicaciones\n✈️ Transporte aéreo\n\nCuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`;
    }

    isValidResponse(response) {
        return !!(response?.messages?.[0]?.id);
    }
}

module.exports = new WelcomeHandlerService();