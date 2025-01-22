const { logInfo, logError } = require('../utils/logger');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const axios = require('axios');
const { googleConfig } = require('../config/google');

const synthesizeSpeech = async (text) => {
    try {
        logInfo('Iniciando síntesis de texto a voz', { textLength: text.length });

        const request = {
            input: { text },
            voice: {
                languageCode: 'es-ES',
                name: 'es-ES-Standard-A',
                ssmlGender: 'FEMALE'
            },
            audioConfig: {
                audioEncoding: 'MP3',
                sampleRateHertz: 24000,
                pitch: 0,
                speakingRate: 1
            }
        };

        const response = await axios({
            method: 'POST',
            url: `${googleConfig.ttsEndpoint}?key=${googleConfig.apiKey}`,
            data: request,
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.data.audioContent) {
            throw new Error('No se generó contenido de audio');
        }

        const audioBuffer = Buffer.from(response.data.audioContent, 'base64');
        const oggBuffer = await convertToOggOpus(audioBuffer);

        return oggBuffer;
    } catch (error) {
        logError('Error en síntesis de texto a voz', { error: error.message });
        throw error;
    }
};

const convertToOggOpus = (audioBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            const inputStream = new Readable();
            inputStream.push(audioBuffer);
            inputStream.push(null);

            const chunks = [];
            
            ffmpeg(inputStream)
                .toFormat('ogg')
                .audioChannels(1)
                .audioFrequency(24000)
                .audioCodec('libopus')
                .audioBitrate('32k')
                .on('error', (err) => {
                    logError('Error en conversión de audio', {
                        error: err.message,
                        command: err.command
                    });
                    reject(err);
                })
                .on('end', () => {
                    const oggBuffer = Buffer.concat(chunks);
                    logInfo('Audio convertido exitosamente', {
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