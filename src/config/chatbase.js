// Archivo de configuración para Chatbase (config/chatbase.js)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // Asegurarse de cargar las variables desde la raíz

const CHATBASE_API_KEY = process.env.CHATBASE_API_KEY; // Clave API global para autenticación

const CHATBASE_SERVICES = {
    "servicios_publicos": {
        chatbotId: process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID, // ID del chatbot
        endpoint: process.env.CHATBASE_API_URL || 'https://www.chatbase.co/api/v1',
    },
    "telecomunicaciones": {
        chatbotId: process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID,
        endpoint: process.env.CHATBASE_API_URL || 'https://www.chatbase.co/api/v1',
    },
    "transporte_aereo": {
        chatbotId: process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID,
        endpoint: process.env.CHATBASE_API_URL || 'https://www.chatbase.co/api/v1',
    },
};

const getChatbaseConfig = (serviceName) => {
    if (!CHATBASE_SERVICES[serviceName]) {
        throw new Error(`Service ${serviceName} is not configured in Chatbase settings.`);
    }
    return { ...CHATBASE_SERVICES[serviceName], apiKey: CHATBASE_API_KEY };
};

module.exports = { getChatbaseConfig };