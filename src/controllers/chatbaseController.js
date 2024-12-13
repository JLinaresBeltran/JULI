// src/controllers/chatbaseController.js

const { testChatbaseMessage } = require('../tests/chatbaseTest');

const handleServiciosPublicos = async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await testChatbaseMessage('servicios_publicos', userMessage);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const handleTelecomunicaciones = async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await testChatbaseMessage('telecomunicaciones', userMessage);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const handleTransporteAereo = async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await testChatbaseMessage('transporte_aereo', userMessage);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    handleServiciosPublicos,
    handleTelecomunicaciones,
    handleTransporteAereo,
};
