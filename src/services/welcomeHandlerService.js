const whatsappService = require('./whatsappService');
const { logInfo, logError } = require('../utils/logger');

class WelcomeHandlerService {
    constructor() {
        this.whatsappService = whatsappService;
    }

    async handleInitialInteraction(userId, userName) {
        try {
            logInfo('Handling initial interaction', {
                userId,
                userName
            });

            const welcomeMessage = this.getWelcomeMessage(userName);
            
            // Enviar mensaje directamente usando whatsappService
            await this.whatsappService.sendTextMessage(
                userId,
                welcomeMessage
            );

            logInfo('Welcome message sent successfully', {
                userId,
                userName,
                messageLength: welcomeMessage.length
            });

            return welcomeMessage;
        } catch (error) {
            logError('Error sending welcome message', {
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

    async routeToService(userId, message) {
        try {
            const response = '¿Por favor, cuéntame más detalles sobre tu caso?\n¿Se trata de servicios públicos (agua, luz, gas), telecomunicaciones (teléfono, internet) o transporte aéreo?';
            
            await this.whatsappService.sendTextMessage(
                userId,
                response
            );

            logInfo('Service routing message sent', {
                userId,
                message
            });

            return response;
        } catch (error) {
            logError('Error in service routing', {
                error: error.message,
                userId,
                message,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = new WelcomeHandlerService();