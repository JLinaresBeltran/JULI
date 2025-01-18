// src/controllers/chatbaseController.js
const { getChatbaseConfig } = require('../config/chatbase');
const axios = require('axios');
const { logInfo, logError } = require('../utils/logger');

const sendChatbaseMessage = async (serviceName, userMessage) => {
    try {
        const config = getChatbaseConfig(serviceName);

        // Validar mensaje del usuario
        if (!userMessage || typeof userMessage !== 'string') {
            throw new Error('Invalid user message provided.');
        }

        const payload = {
            messages: [{ content: userMessage, role: 'user' }],
            chatbotId: config.chatbotId,
            conversationId: `conversation-${serviceName}-${Date.now()}` // Generar ID único
        };

        logInfo('Sending message to Chatbase', {
            service: serviceName,
            payload: payload
        });

        const response = await axios.post(`${config.endpoint}/chat`, payload, {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        logInfo('Chatbase response received', {
            service: serviceName,
            status: response.status
        });

        return response.data;
    } catch (error) {
        logError('Error sending message to Chatbase', {
            error: error.message,
            serviceName,
            responseError: error.response?.data,
            status: error.response?.status
        });

        // Retornar respuesta genérica en caso de error
        return {
            text: 'En este momento no puedo procesar tu solicitud. Por favor, intenta nuevamente más tarde.'
        };
    }
};

// Handlers específicos por servicio
const handleServiciosPublicos = async (message) => {
    return await sendChatbaseMessage('servicios_publicos', message);
};

const handleTelecomunicaciones = async (message) => {
    return await sendChatbaseMessage('telecomunicaciones', message);
};

const handleTransporteAereo = async (message) => {
    return await sendChatbaseMessage('transporte_aereo', message);
};

module.exports = {
    handleServiciosPublicos,
    handleTelecomunicaciones,
    handleTransporteAereo,
    // Exportar función principal para tests
    sendChatbaseMessage
};