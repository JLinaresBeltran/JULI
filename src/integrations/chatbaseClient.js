// src/integrations/chatbaseClient.js
const axios = require('axios');
const { logInfo, logError } = require('../utils/logger');
const { getChatbaseConfig } = require('../config/chatbase');

class ChatbaseClient {
    constructor() {
        this.initialized = false;
        this.activeChats = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Verificar configuraciones de servicios críticos
            const services = ['servicios_publicos', 'telecomunicaciones', 'transporte_aereo'];
            services.forEach(service => {
                const config = getChatbaseConfig(service);
                
                // Validación exhaustiva de configuración
                if (!config.apiKey || !config.chatbotId || !config.endpoint) {
                    throw new Error(`Configuración incompleta para servicio: ${service}. 
                        Verificar apiKey, chatbotId y endpoint.`);
                }
            });

            this.initialized = true;
            logInfo('Cliente Chatbase inicializado correctamente', { 
                serviciosVerificados: services.length 
            });
        } catch (error) {
            logError('Error inicializando cliente Chatbase', { 
                error: error.message,
                esPrimerIntento: !this.initialized
            });
            throw error;
        }
    }

    async getResponse(message, serviceType) {
        try {
            // Asegurar inicialización
            await this.initialize();

            // Obtener configuración específica del servicio
            const config = getChatbaseConfig(serviceType);

            // Generar o recuperar ID de chat
            const chatId = this._getChatId(serviceType);

            // Registro detallado de la solicitud
            logInfo('Solicitando respuesta a Chatbase', { 
                serviceType,
                chatId,
                messageLength: message.length,
                chatbotId: config.chatbotId
            });

            // Realizar solicitud a Chatbase
            const response = await axios({
                method: 'post',
                url: `${config.endpoint}/stream`,
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    messages: [{
                        role: "user",
                        content: message
                    }],
                    chatId: chatId,
                    chatbotId: config.chatbotId,
                    stream: false
                },
                timeout: 10000 // Añadir timeout para prevenir solicitudes largas
            });

            // Validación rigurosa de la respuesta
            if (!response.data || !response.data.text) {
                throw new Error('Respuesta inválida de Chatbase: Contenido faltante');
            }

            // Preparar resultado con metadatos completos
            const result = {
                content: response.data.text,
                metadata: {
                    category: serviceType,
                    chatId: chatId,
                    timestamp: new Date().toISOString(),
                    responseLength: response.data.text.length
                }
            };

            // Registro de respuesta exitosa
            logInfo('Respuesta de Chatbase recibida', {
                serviceType,
                chatId,
                responseLength: result.content.length
            });

            return result;

        } catch (error) {
            // Manejo detallado de errores
            logError('Error obteniendo respuesta de Chatbase', {
                error: error.message,
                serviceType,
                esErrorDeAutenticacion: error.response?.status === 401 || error.response?.status === 403
            });
            
            // Reiniciar estado si hay problemas de autenticación
            if (error.response?.status === 401 || error.response?.status === 403) {
                this.initialized = false;
            }

            throw error;
        }
    }

    // Método para gestionar IDs de chat de manera más robusta
    _getChatId(serviceType) {
        if (!this.activeChats.has(serviceType)) {
            this.activeChats.set(serviceType, this._generateChatId());
        }
        return this.activeChats.get(serviceType);
    }

    // Generación de ID más aleatoria y única
    _generateChatId() {
        return `chatbase_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    // Método para reiniciar chat con mejor manejo
    async resetChat(serviceType) {
        try {
            if (this.activeChats.has(serviceType)) {
                this.activeChats.delete(serviceType);
                logInfo('Chat reiniciado correctamente', { 
                    serviceType,
                    timestamp: new Date().toISOString()
                });
            } else {
                logInfo('No hay chat activo para reiniciar', { serviceType });
            }
        } catch (error) {
            logError('Error al reiniciar chat', { 
                error: error.message,
                serviceType 
            });
        }
    }
}

module.exports = new ChatbaseClient();