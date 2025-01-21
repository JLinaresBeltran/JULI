const fluent = require('fluent-ffmpeg');
const { logInfo, logError } = require('../utils/logger');
const { Readable } = require('stream');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
fluent.setFfmpegPath(ffmpegPath);

const processAudio = async (audioBuffer) => {
    try {
        logInfo('Iniciando procesamiento de audio');

        const rawAudio = await convertAudioToRaw(audioBuffer);
        
        // Enviar a Google STT
        const response = await axios.post(
            `${googleConfig.sttEndpoint}?key=${googleConfig.apiKey}`,
            {
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: 48000,
                    languageCode: 'es-ES',
                    model: 'phone_call'
                },
                audio: {
                    content: rawAudio.toString('base64')
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data.results || response.data.results.length === 0) {
            throw new Error('No se detectó texto en el audio');
        }

        const transcription = response.data.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        logInfo('Transcripción completada', { length: transcription.length });

        return transcription;

    } catch (error) {
        logError('Error procesando audio', { 
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

const convertAudioToRaw = (audioBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            const chunks = [];
            const inputStream = new Readable();
            inputStream.push(audioBuffer);
            inputStream.push(null);

            fluent(inputStream)
                .toFormat('s16le')
                .audioChannels(1)
                .audioFrequency(48000)
                .on('error', (err) => {
                    logError('Error en conversión de audio', {
                        error: err.message,
                        command: err.command
                    });
                    reject(err);
                })
                .on('end', () => {
                    const rawAudio = Buffer.concat(chunks);
                    logInfo('Conversión completada', {
                        inputSize: audioBuffer.length,
                        outputSize: rawAudio.length
                    });
                    resolve(rawAudio);
                })
                .pipe()
                .on('data', chunk => chunks.push(chunk));

        } catch (error) {
            logError('Error en setup de conversión', {
                error: error.message
            });
            reject(error);
        }
    });
};

module.exports = { processAudio };