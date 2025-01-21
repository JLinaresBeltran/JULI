// src/config/google.js
require('dotenv').config();
const axios = require('axios');
const { logInfo, logError } = require('../utils/logger');

// Configuración para las APIs de Google
const googleConfig = {
    apiKey: process.env.GOOGLE_API_KEY,
    // Speech-to-Text
    sttEndpoint: 'https://speech.googleapis.com/v1/speech:recognize',
    // Text-to-Speech
    ttsEndpoint: 'https://texttospeech.googleapis.com/v1/text:synthesize',
    
    // Configuración de Speech-to-Text
    speech: {
        encoding: process.env.GOOGLE_AUDIO_ENCODING || 'LINEAR16',
        sampleRateHertz: parseInt(process.env.GOOGLE_AUDIO_RATE || '48000', 10),
        languageCode: process.env.GOOGLE_LANGUAGE_CODE || 'es-ES',
        model: 'default',
        useEnhanced: true,
        metadata: {
            interactionType: 'DICTATION',
            microphoneDistance: 'NEARFIELD',
            originalMediaType: 'AUDIO_OGG',
            recordingDeviceType: 'SMARTPHONE'
        }
    },

    // Configuración de Text-to-Speech
    tts: {
        languageCode: process.env.GOOGLE_LANGUAGE_CODE || 'es-ES',
        name: process.env.GOOGLE_VOICE_NAME || 'es-ES-Standard-A',
        ssmlGender: process.env.GOOGLE_VOICE_GENDER || 'FEMALE',
        audioConfig: {
            audioEncoding: 'MP3',
            pitch: 0,
            speakingRate: 1,
            effectsProfileId: ['telephony-class-application']
        }
    }
};

// Cliente REST para Speech-to-Text
const speechClient = {
    async recognize(request) {
        try {
            logInfo('Enviando solicitud a Google STT API', {
                endpoint: googleConfig.sttEndpoint,
                audioLength: request.audio.content.length
            });

            const response = await axios.post(
                `${googleConfig.sttEndpoint}?key=${googleConfig.apiKey}`,
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': googleConfig.apiKey
                    }
                }
            );

            logInfo('Respuesta recibida de Google STT API', {
                status: response.status,
                hasResults: !!response.data.results
            });

            return [response.data];
        } catch (error) {
            logError('Error en solicitud a Google STT API', {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }
};

// Cliente REST para Text-to-Speech
const ttsClient = {
    async synthesizeSpeech(request) {
        try {
            logInfo('Enviando solicitud a Google TTS API', {
                endpoint: googleConfig.ttsEndpoint,
                textLength: request.input.text.length
            });

            const response = await axios.post(
                `${googleConfig.ttsEndpoint}?key=${googleConfig.apiKey}`,
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': googleConfig.apiKey
                    }
                }
            );

            logInfo('Respuesta recibida de Google TTS API', {
                status: response.status,
                hasAudioContent: !!response.data.audioContent
            });

            return [{
                audioContent: Buffer.from(response.data.audioContent, 'base64')
            }];
        } catch (error) {
            logError('Error en solicitud a Google TTS API', {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }
};

// Validación de configuración
if (!googleConfig.apiKey) {
    logError('API Key de Google no configurada');
    throw new Error('Se requiere GOOGLE_API_KEY en las variables de entorno');
}

// Exportar la configuración y clientes
module.exports = {
    googleConfig,
    speechClient,
    ttsClient
};