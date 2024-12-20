// Verificación del webhook
exports.verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // Asegúrate de tener esta variable en tu .env

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verificado con éxito.');
        res.status(200).send(challenge); // Meta requiere este challenge como respuesta
    } else {
        console.error('Error en la verificación del webhook');
        res.status(403).send('Forbidden');
    }
};


// Manejo de mensajes entrantes
exports.receiveMessage = (req, res) => {
    try {
        const body = req.body;

        console.log('Evento recibido:', JSON.stringify(body, null, 2));

        // Siempre responde con un 200 para confirmar la recepción del evento
        res.status(200).send('Evento procesado');
    } catch (error) {
        console.error('Error procesando el mensaje:', error);
        res.status(500).send('Error interno del servidor');
    }
};

