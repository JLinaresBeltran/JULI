// src/integrations/googleTTS.js
const { logInfo, logError } = require('../utils/logger');
const ffmpeg = require('fluent-ffmpeg');
const { Readable, Writable } = require('stream');
const axios = require('axios');
const googleConfig = require('../config/google');

const synthesizeSpeech = async (text) => {
    try {
        logInfo('Iniciando síntesis de texto a voz', {
            textLength: text.length
        });

        // 1. Preparar request para Google TTS
        const request = {
            input: { text },
            voice: {
                languageCode: 'es-ES',
                name: 'es-ES-Standard-A',
                ssmlGender: 'FEMALE'
            },
            audioConfig: {
                audioEncoding: 'LINEAR16',
                sampleRateHertz: 48000,
                pitch: 0,
                speakingRate: 1,
                effectsProfileId: ['telephony-class-application']
            }
        };

        logInfo('Enviando solicitud a Google TTS');

        // 2. Enviar solicitud a Google
        const response = await axios.post(
            `${googleConfig.ttsEndpoint}?key=${googleConfig.apiKey}`,
            request,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data.audioContent) {
            throw new Error('No se generó contenido de audio');
        }

        // 3. Convertir el audio a formato OGG (Opus) para WhatsApp
        const audioBuffer = Buffer.from(response.data.audioContent, 'base64');
        const whatsappAudio = await convertToWhatsappFormat(audioBuffer);

        logInfo('Síntesis y conversión completada exitosamente', {
            inputLength: text.length,
            outputSize: whatsappAudio.length
        });

        return whatsappAudio;

    } catch (error) {
        logError('Error en síntesis de texto a voz', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

const convertToWhatsappFormat = (audioBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            logInfo('Convirtiendo audio a formato WhatsApp');
            
            const inputStream = new Readable();
            inputStream.push(audioBuffer);
            inputStream.push(null);

            const chunks = [];
            
            ffmpeg(inputStream)
                .toFormat('ogg')
                .audioChannels(1)
                .audioFrequency(48000)
                .audioCodec('libopus')
                .audioBitrate('32k') // WhatsApp usa bitrate bajo para mensajes de voz
                .on('error', (err) => {
                    logError('Error en conversión a formato WhatsApp', {
                        error: err.message,
                        command: err.command
                    });
                    reject(err);
                })
                .on('end', () => {
                    const oggBuffer = Buffer.concat(chunks);
                    logInfo('Conversión a formato WhatsApp completada', {
                        inputSize: audioBuffer.length,
                        outputSize: oggBuffer.length
                    });
                    resolve(oggBuffer);
                })
                .pipe()
                .on('data', chunk => chunks.push(chunk));

        } catch (error) {
            logError('Error en preparación de conversión', {
                error: error.message
            });
            reject(error);
        }
    });
};

module.exports = { synthesizeSpeech };