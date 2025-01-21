// src/integrations/googleTTS.js
const { ttsClient, googleConfig } = require('../config/google');
const { logInfo, logError } = require('../utils/logger');

const synthesizeSpeech = async (text) => {
    try {
        logInfo('Iniciando síntesis de texto a voz', {
            textLength: text.length
        });

        // 1. Preparar la solicitud
        const request = {
            input: { text },
            voice: {
                languageCode: googleConfig.tts.languageCode,
                name: googleConfig.tts.name,
                ssmlGender: googleConfig.tts.ssmlGender
            },
            audioConfig: {
                audioEncoding: googleConfig.tts.audioConfig.audioEncoding,
                pitch: googleConfig.tts.audioConfig.pitch,
                speakingRate: googleConfig.tts.audioConfig.speakingRate,
                // Optimizaciones para WhatsApp
                effectsProfileId: ['telephony-class-application']
            }
        };

        // 2. Realizar la síntesis
        const [response] = await ttsClient.synthesizeSpeech(request);
        
        if (!response.audioContent) {
            throw new Error('No se generó contenido de audio');
        }

        logInfo('Síntesis completada exitosamente', {
            outputSize: response.audioContent.length
        });

        // 3. Retornar el buffer de audio
        return response.audioContent;
    } catch (error) {
        logError('Error en síntesis de texto a voz', {
            error: error.message,
            stack: error.stack,
            text: text.substring(0, 100) // Primeros 100 caracteres para debug
        });
        throw error;
    }
};

module.exports = { synthesizeSpeech };