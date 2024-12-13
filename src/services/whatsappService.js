// Archivo whatsappService.js (services/whatsappService.js)
const axios = require('axios');

const sendWhatsAppMessage = async (phoneNumber, message) => {
    try {
        const apiUrl = process.env.WHATSAPP_API_URL;
        const token = process.env.WHATSAPP_API_TOKEN;

        const response = await axios.post(
            `${apiUrl}/messages`,
            {
                to: phoneNumber,
                type: 'text',
                text: { body: message },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('WhatsApp message sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
};

module.exports = { sendWhatsAppMessage };