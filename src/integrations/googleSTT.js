// src/integrations/googleSTT.js
const { speechClient, googleConfig } = require('../config/google');
const { logInfo, logError } = require('../utils/logger');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');

const transcribeAudio = async (audioBuffer) => {
    try {
        logInfo('Iniciando proceso de transcripción');

        // 1. Convertir audio OGG a RAW PCM
        const rawAudio = await convertOggToRaw(audioBuffer);
        
        // 2. Preparar la solicitud para Google STT
        const request = {
            config: {
                encoding: googleConfig.speech.encoding,
                sampleRateHertz: googleConfig.speech.sampleRateHertz,
                languageCode: googleConfig.speech.languageCode,
                model: googleConfig.speech.model,
                useEnhanced: true
            },
            audio: {
                content: rawAudio.toString('base64')
            }
        };

        logInfo('Enviando solicitud a Google Speech-to-Text', {
            audioSize: rawAudio.length,
            sampleRate: googleConfig.speech.sampleRateHertz
        });
        
        // 3. Realizar la transcripción
        const [response] = await speechClient.recognize(request);
        
        if (!response.results || response.results.length === 0) {
            throw new Error('No se detectó texto en el audio');
        }

        // 4. Procesar y retornar resultados
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        logInfo('Transcripción completada exitosamente', {
            length: transcription.length,
            text: transcription.substring(0, 100) // Primeros 100 caracteres para debug
        });

        return transcription;
    } catch (error) {
        logError('Error en transcripción de audio', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

const convertOggToRaw = (audioBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            logInfo('Iniciando conversión de audio OGG a RAW');
            
            const inputStream = new Readable();
            inputStream.push(audioBuffer);
            inputStream.push(null);

            const chunks = [];
            
            ffmpeg(inputStream)
                .toFormat('s16le')
                .audioChannels(1)
                .audioFrequency(googleConfig.speech.sampleRateHertz)
                .on('error', (err) => {
                    logError('Error en conversión de audio', {
                        error: err.message,
                        command: err.command
                    });
                    reject(err);
                })
                .on('end', () => {
                    const rawAudio = Buffer.concat(chunks);
                    logInfo('Conversión de audio completada', {
                        inputSize: audioBuffer.length,
                        outputSize: rawAudio.length
                    });
                    resolve(rawAudio);
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

module.exports = { transcribeAudio };