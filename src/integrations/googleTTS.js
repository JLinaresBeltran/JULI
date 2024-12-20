const { ttsClient } = require('../config/google');

const synthesizeSpeech = async (text) => {
    try {
        const request = {
            input: { text },
            voice: { languageCode: 'es-ES', ssmlGender: 'NEUTRAL' },
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        return response.audioContent; // Buffer con contenido del audio
    } catch (error) {
        console.error('Error al sintetizar texto:', error.message);
        throw error;
    }
};

module.exports = { synthesizeSpeech };
