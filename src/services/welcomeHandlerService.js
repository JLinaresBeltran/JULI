// src/services/welcomeHandlerService.js
const { logInfo, logError } = require('../utils/logger');
const chatbaseClient = require('../integrations/chatbaseClient');
const googleService = require('./googleService');

class WelcomeHandlerService {
    constructor() {
        this.welcomeTemplate = "¡Hola {name}! 👋\n\n" +
            "Soy JULI 🤖, tu asistente legal virtual. Estoy aquí para brindarte orientación en:\n\n" +
            "📱 Servicios públicos domiciliarios\n" +
            "📞 Telecomunicaciones\n" +
            "✈️ Transporte aéreo\n\n" +
            "Por favor, describe detalladamente tu situación y con gusto te ayudaré. " +
            "Puedes escribir tu mensaje o enviar una nota de voz 🎤";
    }

    getWelcomeMessage(name) {
        return this.welcomeTemplate.replace('{name}', name);
    }

    async handleIncomingMessage(message, userProfile) {
        try {
            // Si es el primer mensaje, enviar bienvenida
            if (message.isFirstMessage) {
                const name = userProfile?.name || 'Usuario';
                return {
                    type: 'welcome',
                    content: this.getWelcomeMessage(name)
                };
            }

            // Procesar el mensaje según su tipo
            let messageContent;
            if (message.type === 'audio') {
                // Transcribir audio a texto
                messageContent = await this.handleAudioMessage(message);
            } else {
                messageContent = message.text?.body || '';
            }

            // Identificar el tipo de servicio
            const serviceType = await this.identifyServiceType(messageContent);

            // Redirigir al chatbot específico
            return await this.redirectToChatbot(serviceType, messageContent);

        } catch (error) {
            logError('Error en handleIncomingMessage:', error);
            throw error;
        }
    }

    async handleAudioMessage(message) {
        try {
            // Obtener el contenido del audio
            const audioBuffer = await this.fetchAudioContent(message.audio.id);
            
            // Transcribir usando Google STT
            const transcription = await googleService.transcribeAudio(audioBuffer);
            
            logInfo('Audio transcrito exitosamente', {
                messageId: message.id,
                transcription: transcription
            });

            return transcription;
        } catch (error) {
            logError('Error procesando mensaje de audio:', error);
            throw error;
        }
    }

    async identifyServiceType(content) {
        // Palabras clave para identificar el tipo de servicio
        const keywords = {
            servicios_publicos: ['agua', 'luz', 'gas', 'energía', 'acueducto', 'alcantarillado', 'factura', 'recibo', 'medidor'],
            telecomunicaciones: ['internet', 'teléfono', 'celular', 'móvil', 'plan', 'datos', 'fibra', 'televisión', 'cable'],
            transporte_aereo: ['vuelo', 'avión', 'aerolínea', 'ticket', 'tiquete', 'reserva', 'equipaje', 'maleta']
        };

        const contentLower = content.toLowerCase();
        
        for (const [service, words] of Object.entries(keywords)) {
            if (words.some(word => contentLower.includes(word))) {
                return service;
            }
        }

        // Si no se identifica claramente, preguntar al usuario
        return 'unidentified';
    }

    async redirectToChatbot(serviceType, content) {
        const chatbotConfig = {
            servicios_publicos: process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID,
            telecomunicaciones: process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID,
            transporte_aereo: process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID,
            unidentified: process.env.CHATBASE_GENERAL_CHATBOT_ID
        };

        const chatbotId = chatbotConfig[serviceType];
        
        if (!chatbotId) {
            throw new Error(`Chatbot no configurado para el servicio: ${serviceType}`);
        }

        try {
            const response = await chatbaseClient.sendMessage(chatbotId, content);
            return {
                type: 'redirect',
                serviceType,
                response: response.text
            };
        } catch (error) {
            logError('Error redirigiendo al chatbot:', error);
            throw error;
        }
    }

    async fetchAudioContent(audioId) {
        // Implementar la lógica para obtener el contenido del audio desde WhatsApp
        // Esta implementación dependerá de la API de WhatsApp Business
        throw new Error('Método fetchAudioContent no implementado');
    }
}

module.exports = new WelcomeHandlerService();