const { logInfo, logError } = require('../utils/logger');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const axios = require('axios');
const { googleConfig } = require('../config/google');

const synthesizeSpeech = async (text) => {
    try {
        logInfo('Iniciando síntesis de texto a voz', { 
            textLength: text.length 
        });

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

        const response = await axios({
            method: 'POST',
            url: `${googleConfig.ttsEndpoint}?key=${googleConfig.apiKey}`,
            data: request,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.audioContent) {
            throw new Error('No se generó contenido de audio');
        }

        const audioBuffer = Buffer.from(response.data.audioContent, 'base64');
        const oggBuffer = await convertToOgg(audioBuffer);

        logInfo('Síntesis completada exitosamente', {
            inputLength: text.length,
            outputSize: oggBuffer.length
        });

        return oggBuffer;

    } catch (error) {
        logError('Error en síntesis de texto a voz', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

const convertToOgg = (audioBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            const inputStream = new Readable();
            inputStream.push(audioBuffer);
            inputStream.push(null);

            const chunks = [];
            
            ffmpeg(inputStream)
                .toFormat('ogg')
                .audioChannels(1)
                .audioFrequency(48000)
                .audioCodec('libopus')
                .audioBitrate('32k')
                .on('error', (err) => {
                    logError('Error en conversión a OGG', {
                        error: err.message,
                        command: err.command
                    });
                    reject(err);
                })
                .on('end', () => {
                    const oggBuffer = Buffer.concat(chunks);
                    logInfo('Conversión a OGG completada', {
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