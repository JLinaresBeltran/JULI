// src/services/audioProcessor.js
const ffmpeg = require('fluent-ffmpeg');
const { logInfo, logError } = require('../utils/logger');
const { Readable } = require('stream');
const axios = require('axios');
const { googleConfig } = require('../config/google');

class AudioProcessor {
    static async processAudio(audioBuffer, mimeType) {
        try {
            logInfo('Google STT Service initialized');
            logInfo('Convirtiendo audio OGG a WAV/PCM');

            // 1. Convertir audio OGG a RAW PCM
            const rawAudio = await this.convertAudio(audioBuffer);
            logInfo('Conversión de audio completada');
            logInfo('Audio convertido correctamente');

            // 2. Preparar request para Google STT
            const requestData = {
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: 48000,
                    languageCode: 'es-ES',
                    model: 'phone_call',
                    enableAutomaticPunctuation: true
                },
                audio: {
                    content: rawAudio.toString('base64')
                }
            };

            logInfo('Enviando solicitud a Google Speech-to-Text');

            // 3. Enviar solicitud a Google STT
            const response = await axios({
                method: 'POST',
                url: googleConfig.sttEndpoint,
                params: {
                    key: googleConfig.apiKey
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                data: requestData
            });

            if (!response.data.results || response.data.results.length === 0) {
                throw new Error('No se detectó texto en el audio');
            }

            const transcription = response.data.results
                .map(result => result.alternatives[0].transcript)
                .join('\n');

            logInfo('Transcripción completada exitosamente', {
                length: transcription.length
            });

            return transcription;

        } catch (error) {
            logError('Error en transcripción de audio', { error: error.message });
            throw error;
        }
    }

    static async convertAudio(audioBuffer) {
        return new Promise((resolve, reject) => {
            try {
                const chunks = [];
                const inputStream = new Readable();
                inputStream.push(audioBuffer);
                inputStream.push(null);

                ffmpeg(inputStream)
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
                        resolve(rawAudio);
                    })
                    .on('progress', (progress) => {
                        logInfo('Progreso de conversión', { progress });
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
    }
}

module.exports = AudioProcessor;