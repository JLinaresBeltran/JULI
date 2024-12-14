// Refactor de chatbaseController.js

// Importar configuraciones reales, NO las pruebas
const { getChatbaseConfig } = require('../config/chatbase');
const axios = require('axios');

// Función para manejar mensajes reales a Chatbase
const sendChatbaseMessage = async (serviceName, userMessage) => {
    try {
        const config = getChatbaseConfig(serviceName);

        const payload = {
            messages: [
                { content: userMessage, role: 'user' },
            ],
        };

        const response = await axios.post(config.apiUrl, payload, {
            headers: { Authorization: `Bearer ${config.apiKey}` },
        });

        return response.data;
    } catch (error) {
        console.error('Error al enviar mensaje a Chatbase:', error.message);
        throw error;
    }
};

// Handlers para los endpoints
const handleServiciosPublicos = async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await sendChatbaseMessage('servicios_publicos', userMessage);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const handleTelecomunicaciones = async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await sendChatbaseMessage('telecomunicaciones', userMessage);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const handleTransporteAereo = async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await sendChatbaseMessage('transporte_aereo', userMessage);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Exportar controladores
module.exports = {
    handleServiciosPublicos,
    handleTelecomunicaciones,
    handleTransporteAereo,
};
