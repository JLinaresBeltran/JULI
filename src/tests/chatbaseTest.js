const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const axios = require('axios');
const { getChatbaseConfig } = require('../config/chatbase');

// Función para retrasar solicitudes (evitar problemas de concurrencia o límites de tasa)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Función para probar mensajes
const testChatbaseMessage = async (serviceName, userMessage) => {
    try {
        const config = getChatbaseConfig(serviceName);

        // Validar mensaje del usuario
        if (!userMessage || typeof userMessage !== 'string') {
            throw new Error('Invalid user message provided.');
        }

        const payload = {
            messages: [{ content: userMessage, role: 'user' }],
            chatbotId: config.chatbotId,
            conversationId: `test-conversation-${serviceName}-${Date.now()}`, // Asegurar IDs únicos
        };

        console.log(`\n[INFO] Sending payload to ${serviceName}:\n`, JSON.stringify(payload, null, 2));

        const response = await axios.post(`${config.endpoint}/chat`, payload, {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        console.log(`\n[SUCCESS] Response from ${serviceName}:\n`, JSON.stringify(response.data, null, 2));
        return response.data;

    } catch (error) {
        console.error(`\n[ERROR] Error interacting with ${serviceName}:`, error.message);

        if (error.response) {
            console.error('[ERROR] Response details:', {
                status: error.response.status,
                headers: error.response.headers,
                data: error.response.data,
            });

            if (error.response.data?.message?.includes('JSON object requested')) {
                console.error(`[ERROR] Invalid response format from ${serviceName}.`);
            }
        }

        // Retornar un mensaje de error genérico si el servicio falla
        return { text: 'Hubo un problema procesando tu solicitud. Por favor, inténtalo más tarde.' };
    }
};

// Probar el envío de mensajes a los diferentes chatbots
(async () => {
    try {
        console.log('[INFO] CHATBASE_API_KEY:', process.env.CHATBASE_API_KEY);

        const servicios = [
            { name: 'servicios_publicos', message: '¿Cómo puedo pagar mi factura de agua?' },
            { name: 'telecomunicaciones', message: '¿Qué planes de internet ofrecen?' },
            { name: 'transporte_aereo', message: '¿Cómo reporto un equipaje perdido?' },
        ];

        // Iterar sobre los servicios con retraso para evitar límites de tasa
        for (const { name, message } of servicios) {
            await delay(1000); // Retraso de 1 segundo entre solicitudes
            try {
                const result = await testChatbaseMessage(name, message);
                console.log(`[RESULT] ${name} response:`, result);
            } catch (err) {
                console.error(`[ERROR] Failed to test ${name}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[CRITICAL] Unexpected error during tests:', err.message);
    }
})();
