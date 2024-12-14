const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Verificación de variables de entorno
const requiredEnv = [
    'CHATBASE_API_KEY',
    'CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID',
    'CHATBASE_TELECOMUNICACIONES_CHATBOT_ID',
    'CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID'
];

requiredEnv.forEach((envVar) => {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
});

const CHATBASE_API_KEY = process.env.CHATBASE_API_KEY;

const CHATBASE_SERVICES = {
    servicios_publicos: {
        chatbotId: process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID,
        endpoint: process.env.CHATBASE_API_URL || 'https://www.chatbase.co/api/v1',
    },
    telecomunicaciones: {
        chatbotId: process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID,
        endpoint: process.env.CHATBASE_API_URL || 'https://www.chatbase.co/api/v1',
    },
    transporte_aereo: {
        chatbotId: process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID,
        endpoint: process.env.CHATBASE_API_URL || 'https://www.chatbase.co/api/v1',
    },
};

const getChatbaseConfig = (serviceName) => {
    const serviceConfig = CHATBASE_SERVICES[serviceName];
    if (!serviceConfig) {
        throw new Error(`Service ${serviceName} is not configured in Chatbase settings.`);
    }
    return { ...serviceConfig, apiKey: CHATBASE_API_KEY };
};

module.exports = { getChatbaseConfig };
