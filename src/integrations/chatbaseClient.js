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

    async getResponse(message, serviceType, isContextMessage = false) {
        try {
            await this.initialize();
            const config = getChatbaseConfig(serviceType);
            
            // Obtener o crear el ID de conversación para este servicio
            const conversationId = this.activeChats.get(serviceType) || 
                                 `conv-${serviceType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            
            // Obtener el historial de mensajes actual
            let messages = this.messageHistory.get(conversationId) || [];
            
            // Si es un mensaje de contexto, reiniciar el historial
            if (isContextMessage) {
                messages = [];
            }
            
            // Agregar el nuevo mensaje al historial
            messages.push({
                content: message,
                role: 'user'
            });

            logInfo('Solicitando respuesta a Chatbase', { 
                serviceType,
                messageCount: messages.length,
                chatbotId: config.chatbotId,
                conversationId
            });

            const payload = {
                messages,
                chatbotId: config.chatbotId,
                conversationId,
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
                content: response.data.text,
                role: 'assistant'
            });

            // Actualizar el historial y el ID de conversación
            this.messageHistory.set(conversationId, messages);
            this.activeChats.set(serviceType, conversationId);

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
                conversationId,
                messageCount: messages.length
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
            
            if (error.response?.status === 401 || error.response?.status === 403) {
                this.initialized = false;
            }

            throw error;
        }
    }

    async resetChat(serviceType) {
        try {
            const conversationId = this.activeChats.get(serviceType);
            if (conversationId) {
                this.messageHistory.delete(conversationId);
                this.activeChats.delete(serviceType);
            }
            logInfo('Chat reset successful', { serviceType });
        } catch (error) {
            logError('Error resetting chat', { 
                error: error.message,
                serviceType 
            });
        }
    }
}

module.exports = new ChatbaseClient();