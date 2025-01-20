// src/integrations/chatbaseClient.js
const { logInfo, logError } = require('../utils/logger');
const { getChatbaseConfig } = require('../config/chatbase');
const axios = require('axios');

class ChatbaseClient {
    constructor() {
        this.initialized = false;
        this.activeChats = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Verificar que podemos obtener configuraciones para todos los servicios
            const services = ['servicios_publicos', 'telecomunicaciones', 'transporte_aereo'];
            services.forEach(service => {
                const config = getChatbaseConfig(service);
                if (!config.apiKey || !config.chatbotId || !config.endpoint) {
                    throw new Error(`Invalid configuration for service: ${service}`);
                }
            });

            this.initialized = true;
            logInfo('Chatbase client initialized successfully');
        } catch (error) {
            logError('Error initializing Chatbase client', { error: error.message });
            throw error;
        }
    }

    async getResponse(message, serviceType) {
        try {
            await this.initialize();

            // Obtener configuración específica del servicio
            const config = getChatbaseConfig(serviceType);

            logInfo('Solicitando respuesta a Chatbase', { 
                serviceType,
                messageLength: message.length,
                chatbotId: config.chatbotId
            });

            // Preparar el ID único para la conversación
            const conversationId = this.activeChats.get(serviceType) || 
                                 `conv-${serviceType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            this.activeChats.set(serviceType, conversationId);

            // Preparar el payload según el formato probado exitosamente
            const payload = {
                messages: [{ 
                    content: message, 
                    role: 'user' 
                }],
                chatbotId: config.chatbotId,
                conversationId: conversationId
            };

            // Realizar la petición a Chatbase usando la URL correcta
            const response = await axios({
                method: 'post',
                url: `${config.endpoint}/chat`,
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                data: payload
            });

            // Validar y procesar la respuesta
            if (!response.data || !response.data.text) {
                throw new Error('Invalid response from Chatbase');
            }

            const result = {
                content: response.data.text,
                metadata: {
                    category: serviceType,
                    conversationId,
                    timestamp: new Date().toISOString()
                }
            };

            logInfo('Respuesta de Chatbase recibida', {
                serviceType,
                responseLength: result.content.length,
                conversationId
            });

            return result;

        } catch (error) {
            logError('Error getting Chatbase response', {
                error: error.message,
                serviceType,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            
            // Si el error es de autenticación o configuración, reinicializar
            if (error.response?.status === 401 || error.response?.status === 403) {
                this.initialized = false;
            }

            throw error;
        }
    }

    async resetChat(serviceType) {
        try {
            this.activeChats.delete(serviceType);
            logInfo('Chat reset successful', { serviceType });
        } catch (error) {
            logError('Error resetting chat', { 
                error: error.message,
                serviceType 
            });
        }
    }

    _generateConversationId(serviceType) {
        return `conv-${serviceType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
}

module.exports = new ChatbaseClient();