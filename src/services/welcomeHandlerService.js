const { ConversationManager } = require('./conversation');
const { identifyServiceType } = require('../utils/serviceIdentifier');
const chatbaseClient = require('../integrations/chatbaseClient');
const logger = require('../utils/logger');

class WelcomeHandlerService {
    constructor() {
        this.conversationManager = new ConversationManager();
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

    async handleInitialInteraction(userId, userName) {
        try {
            // Registrar nueva conversación
            await this.conversationManager.initializeConversation(userId);
            
            // Enviar mensaje de bienvenida
            return this.getWelcomeMessage(userName);
        } catch (error) {
            logger.error('Error en handleInitialInteraction:', error);
            throw error;
        }
    }

    async routeToService(userId, message) {
        try {
            // Identificar tipo de servicio basado en el mensaje
            const serviceType = await identifyServiceType(message);
            
            // Obtener la instancia de chatbase correspondiente
            const chatbot = await chatbaseClient.getChatbotForService(serviceType);
            
            // Actualizar el estado de la conversación
            await this.conversationManager.updateConversationService(userId, serviceType);
            
            // Procesar el mensaje con el chatbot correspondiente
            return await chatbot.processMessage(message);
        } catch (error) {
            logger.error('Error en routeToService:', error);
            throw error;
        }
    }
}

module.exports = new WelcomeHandlerService();