// Archivo de prueba para Chatbase (tests/chatbaseTest.js)
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // Asegurarse de cargar las variables desde la raíz

const axios = require('axios');
const { getChatbaseConfig } = require('../config/chatbase');

const testChatbaseMessage = async (serviceName, userMessage) => {
    try {
        const config = getChatbaseConfig(serviceName);

        const payload = {
            messages: [
                { content: userMessage, role: "user" }
            ],
            chatbotId: config.chatbotId,
            conversationId: `test-conversation-${serviceName}`
        };

        console.log(`Sending payload to ${serviceName}:`, JSON.stringify(payload, null, 2));

        const response = await axios.post(
            `${config.endpoint}/chat`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`Response from ${serviceName}:`, JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error(`Error interacting with ${serviceName}:`, error.response?.data || error.message);
        if (error.response) {
            console.log('Error response details:', {
                status: error.response.status,
                headers: error.response.headers,
                data: error.response.data,
            });
        }
    }
};

// Probar envío de mensajes
(async () => {
    console.log('CHATBASE_API_KEY:', process.env.CHATBASE_API_KEY);
    console.log('CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID:', process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID);
    console.log('CHATBASE_TELECOMUNICACIONES_CHATBOT_ID:', process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID);
    console.log('CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID:', process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID);

    await testChatbaseMessage('servicios_publicos', '¿Cómo puedo pagar mi factura de agua?');
    await testChatbaseMessage('telecomunicaciones', '¿Qué planes de internet ofrecen?');
    await testChatbaseMessage('transporte_aereo', '¿Cómo reporto un equipaje perdido?');
})();
