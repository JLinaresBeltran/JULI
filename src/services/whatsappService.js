const axios = require('axios');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

const sendMessage = async (to, templateName) => {
    try {
        const response = await axios.post(
            `${WHATSAPP_API_URL}/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'en_US' },
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
                },
            }
        );
        console.log('Mensaje enviado:', response.data);
    } catch (error) {
        console.error('Error enviando mensaje:', error.response?.data || error.message);
    }
};
