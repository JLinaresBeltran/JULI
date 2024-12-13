const processWebhook = (req, res) => {
    // Lógica para procesar el webhook recibido
    console.log('Webhook data:', req.body);
    res.status(200).json({ message: 'Webhook processed successfully' });
};

module.exports = { processWebhook };
