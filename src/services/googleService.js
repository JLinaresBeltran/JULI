const { speechClient, ttsClient } = require('../config/google');

// Función para transcribir audio (STT)
const transcribeAudio = async (audioBuffer) => {
    try {
        const audio = {
            content: audioBuffer.toString('base64'),
        };

        const config = {
            encoding: 'LINEAR16', // Configura según el tipo de audio esperado
            sampleRateHertz: 16000, // Configura según el audio entrante
            languageCode: 'es-ES', // Cambiar según el idioma esperado
        };

        const request = { audio, config };
        const [response] = await speechClient.recognize(request);

        return response.results
            .map((result) => result.alternatives[0].transcript)
            .join('\n');
    } catch (error) {
        console.error('Error en STT:', error.message);
        throw new Error('No se pudo transcribir el audio');
    }
};

// Función para sintetizar texto a audio (TTS)
const synthesizeSpeech = async (text) => {
    try {
        const request = {
            input: { text },
            voice: { languageCode: 'es-ES', ssmlGender: 'NEUTRAL' },
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        return response.audioContent; // Buffer con contenido de audio
    } catch (error) {
        console.error('Error en TTS:', error.message);
        throw new Error('No se pudo generar el audio');
    }
};

module.exports = { transcribeAudio, synthesizeSpeech };
