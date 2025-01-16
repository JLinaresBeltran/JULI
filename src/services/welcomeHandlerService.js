const whatsappService = require('./whatsappService');
const { logInfo, logError } = require('../utils/logger');

class WelcomeHandlerService {
    async handleInitialInteraction(userId, userName) {
        try {
            logInfo('Sending welcome message', {
                userId,
                userName
            });

            const welcomeMessage = {
                type: 'text',
                text: { 
                    body: this.getWelcomeMessage(userName)
                }
            };

            await whatsappService.sendMessage(userId, welcomeMessage);

            logInfo('Welcome message sent successfully', {
                userId,
                userName
            });

            return welcomeMessage;
        } catch (error) {
            logError('Failed to send welcome message', {
                error: error.message,
                userId,
                userName,
                stack: error.stack
            });
            throw error;
        }
    }

    getWelcomeMessage(userName) {
        return `¡Hola ${userName}! 👋\n\nSoy JULI, tu asistente virtual personalizada ✨\n\nMe especializo en brindarte orientación sobre:\n🏠 Servicios públicos\n📱 Telecomunicaciones\n✈️ Transporte aéreo\n\nCuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`;
    }
}

module.exports = new WelcomeHandlerService();