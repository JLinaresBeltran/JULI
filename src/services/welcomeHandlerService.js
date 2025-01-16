const { logInfo, logError } = require('../utils/logger');
const whatsappService = require('./whatsappService');
const serviceIdentifier = require('../utils/serviceIdentifier');

class WelcomeHandlerService {
    constructor() {
        this.greetings = [
            'hola',
            'buenos días',
            'buen día',
            'buenas',
            'buenas tardes',
            'buenas noches',
            'hi',
            'hello'
        ];
    }

    async handleInitialInteraction(userId, userName) {
        try {
            const welcomeMessage = this.getWelcomeMessage(userName);
            await whatsappService.sendTextMessage(userId, welcomeMessage);
            
            logInfo('Welcome message sent', {
                userId,
                userName
            });

            return welcomeMessage;
        } catch (error) {
            logError('Error sending welcome message', {
                error: error.message,
                userId,
                userName
            });
            throw error;
        }
    }

    getWelcomeMessage(userName) {
        return `¡Hola ${userName}! 👋 

Soy JULI, tu asistente virtual personalizada ✨ 

Me especializo en brindarte orientación sobre:
🏠 Servicios públicos
📱 Telecomunicaciones
✈️ Transporte aéreo

Cuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`;
    }

    isGreeting(text) {
        return text && this.greetings.some(greeting => 
            text.toLowerCase().trim().includes(greeting.toLowerCase())
        );
    }

    async routeToService(userId, message) {
        try {
            const serviceType = await serviceIdentifier.identifyServiceType(message);
            if (!serviceType) {
                const response = `Por favor, cuéntame más detalles sobre tu caso. 
                ¿Se trata de servicios públicos (agua, luz, gas), telecomunicaciones (teléfono, internet) o transporte aéreo?`;
                await whatsappService.sendTextMessage(userId, response);
                return response;
            }

            const serviceResponse = this._getServiceSpecificResponse(serviceType);
            await whatsappService.sendTextMessage(userId, serviceResponse);
            return serviceResponse;

        } catch (error) {
            logError('Error routing service', {
                error: error.message,
                userId,
                message
            });
            throw error;
        }
    }

    _getServiceSpecificResponse(serviceType) {
        const responses = {
            SERVICIOS_PUBLICOS: 'Entiendo que tu consulta es sobre servicios públicos. Para ayudarte mejor, ¿podrías especificar si es sobre agua, luz, gas u otro servicio? 🏠',
            TELECOMUNICACIONES: 'Veo que tu consulta es sobre telecomunicaciones. ¿Es sobre telefonía móvil, internet, televisión u otro servicio? 📱',
            TRANSPORTE_AEREO: 'Comprendo que tu consulta es sobre transporte aéreo. ¿Es sobre un vuelo, equipaje, cancelación u otro tema? ✈️'
        };

        return responses[serviceType] || 'Por favor, proporciona más detalles sobre tu caso.';
    }
}

module.exports = new WelcomeHandlerService();