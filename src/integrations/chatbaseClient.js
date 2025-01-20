// src/integrations/chatbaseClient.js
const { logInfo, logError } = require('../utils/logger');
const { getChatbaseConfig } = require('../config/chatbase');
const axios = require('axios');

class ChatbaseClient {
    constructor() {
        this.initialized = false;
        this.activeChats = new Map();
        this.messageHistory = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
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

    async getResponse(message, serviceType, isFirstInteraction = false) {
        try {
            await this.initialize();
            const config = getChatbaseConfig(serviceType);
            
            // Obtener o crear el ID de conversación
            let conversationId = this.activeChats.get(serviceType);
            if (!conversationId || isFirstInteraction) {
                conversationId = `conv-${serviceType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                this.activeChats.set(serviceType, conversationId);
                this.messageHistory.set(conversationId, []);
                
                logInfo('Nueva conversación Chatbase iniciada', {
                    serviceType,
                    conversationId,
                    isFirstInteraction
                });
            }
            
            // Obtener el historial de mensajes
            const messages = this.messageHistory.get(conversationId) || [];

            // Si es la primera interacción, agregar el mensaje de contexto
            if (isFirstInteraction) {
                const contextMessage = {
                    role: 'assistant',
                    content: "Hola, soy JULI. Estoy aquí para brindarte orientación en tus dudas o reclamos. Por favor, describe detalladamente tu situación."
                };
                messages.push(contextMessage);
            }

            // Agregar el nuevo mensaje del usuario
            messages.push({
                role: 'user',
                content: message
            });

            logInfo('Solicitando respuesta a Chatbase', {
                serviceType,
                messageCount: messages.length,
                conversationId,
                isFirstInteraction
            });

            const payload = {
                messages: messages,
                chatbotId: config.chatbotId,
                conversationId: conversationId,
                stream: false
            };

            const response = await axios({
                method: 'post',
                url: `${config.endpoint}/chat`,
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                data: payload
            });

            if (!response.data || !response.data.text) {
                throw new Error('Invalid response from Chatbase');
            }

            // Agregar la respuesta al historial
            messages.push({
                role: 'assistant',
                content: response.data.text
            });

            // Actualizar el historial
            this.messageHistory.set(conversationId, messages);

            const result = {
                content: response.data.text,
                metadata: {
                    category: serviceType,
                    conversationId,
                    messageCount: messages.length,
                    timestamp: new Date().toISOString()
                }
            };

            logInfo('Respuesta de Chatbase recibida', {
                serviceType,
                responseLength: result.content.length,
                conversationId,
                messageCount: messages.length,
                isFirstInteraction
            });

            return result;

        } catch (error) {
            logError('Error getting Chatbase response', {
                error: error.message,
                serviceType,
                stack: error.stack
            });
            throw error;
        }
    }

    async resetChat(serviceType) {
        try {
            const conversationId = this.activeChats.get(serviceType);
            if (conversationId) {
                this.messageHistory.delete(conversationId);
                this.activeChats.delete(serviceType);
                logInfo('Chat reset successful', { 
                    serviceType,
                    conversationId
                });
            }
        } catch (error) {
            logError('Error resetting chat', { 
                error: error.message,
                serviceType 
            });
        }
    }

    getMessageCount(serviceType) {
        const conversationId = this.activeChats.get(serviceType);
        if (conversationId) {
            const messages = this.messageHistory.get(conversationId);
            return messages ? messages.length : 0;
        }
        return 0;
    }
}

module.exports = new ChatbaseClient();