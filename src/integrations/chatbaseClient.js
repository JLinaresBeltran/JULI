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

            // Preparar el stream ID único para la conversación
            const streamId = this.activeChats.get(serviceType) || this._generateStreamId();
            this.activeChats.set(serviceType, streamId);

            // Realizar la petición a Chatbase
            const response = await axios({
                method: 'post',
                url: `${config.endpoint}/stream`,
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    messages: [
                        {
                            role: "user",
                            content: message
                        }
                    ],
                    chatId: streamId,
                    chatbotId: config.chatbotId,
                    stream: false
                }
            });

            // Validar y procesar la respuesta
            if (!response.data || !response.data.text) {
                throw new Error('Invalid response from Chatbase');
            }

            const result = {
                content: response.data.text,
                metadata: {
                    category: serviceType,
                    streamId,
                    timestamp: new Date().toISOString()
                }
            };

            logInfo('Respuesta de Chatbase recibida', {
                serviceType,
                responseLength: result.content.length,
                streamId
            });

            return result;

        } catch (error) {
            logError('Error getting Chatbase response', {
                error: error.message,
                serviceType
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

    _generateStreamId() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }
}

module.exports = new ChatbaseClient();