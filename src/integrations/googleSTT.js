const { logInfo, logError } = require('../utils/logger');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const axios = require('axios');
const { googleConfig } = require('../config/google');

const transcribeAudio = async (audioBuffer, mimeType = 'audio/ogg') => {
    try {
        logInfo('Google STT Service initialized');
        
        const rawAudio = await convertAudio(audioBuffer);
        
        logInfo('Audio convertido correctamente', {
            originalSize: audioBuffer.length,
            convertedSize: rawAudio.length
        });

        const request = {
            config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 48000,
                languageCode: 'es-ES',
                model: 'phone_call',
                enableAutomaticPunctuation: true,
                metadata: {
                    interactionType: 'DICTATION',
                    microphoneDistance: 'NEARFIELD',
                    originalMediaType: mimeType,
                    recordingDeviceType: 'SMARTPHONE'
                }
            },
            audio: {
                content: rawAudio.toString('base64')
            }
        };

        logInfo('Enviando solicitud a Google Speech-to-Text');

        const response = await axios.post(
            `${googleConfig.sttEndpoint}?key=${googleConfig.apiKey}`,
            request,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data.results) {
            throw new Error('No se detectó texto en el audio');
        }

        const transcription = response.data.results
            .map(result => result.alternatives[0].transcript)
            .join(' ');

        logInfo('Transcripción completada exitosamente', {
            length: transcription.length
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

const convertAudio = (audioBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            logInfo('Convirtiendo audio OGG a WAV/PCM');
            
            const inputStream = new Readable();
            inputStream.push(audioBuffer);
            inputStream.push(null);

            const chunks = [];
            
            ffmpeg(inputStream)
                .toFormat('wav')
                .audioChannels(1)
                .audioFrequency(48000)
                .audioCodec('pcm_s16le')
                .on('error', (err) => {
                    logError('Error en conversión de audio', {
                        error: err.message,
                        command: err.command
                    });
                    reject(err);
                })
                .on('end', () => {
                    const wavBuffer = Buffer.concat(chunks);
                    const rawPcm = wavBuffer.slice(44);
                    
                    logInfo('Conversión de audio completada', {
                        inputSize: audioBuffer.length,
                        outputSize: rawPcm.length
                    });
                    
                    resolve(rawPcm);
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