const { speechClient } = require('../config/google');

const transcribeAudio = async (audioBuffer) => {
    try {
        const audio = {
            content: audioBuffer.toString('base64'),
        };

        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'es-ES',
        };

        const request = { audio, config };
        const [response] = await speechClient.recognize(request);

        return response.results
            .map((result) => result.alternatives[0].transcript)
            .join('\n');
    } catch (error) {
        console.error('Error al transcribir audio:', error.message);
        throw error;
    }
};

module.exports = { transcribeAudio };
