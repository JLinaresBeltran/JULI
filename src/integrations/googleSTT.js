// src/integrations/googleSTT.js
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');
const { logInfo, logError } = require('../utils/logger');

class GoogleSTTService {
    constructor() {
        try {
            // Inicializar cliente de Speech-to-Text
            this.speechClient = new speech.SpeechClient({
                keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
                projectId: process.env.GOOGLE_PROJECT_ID
            });
            
            logInfo('Google STT Service initialized successfully');
        } catch (error) {
            logError('Error initializing Google STT Service', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async transcribeAudio(audioBuffer, mimeType) {
        try {
            logInfo('Starting audio transcription', {
                bufferSize: audioBuffer.length,
                mimeType
            });

            // Configurar el encoding basado en el mime type
            const encoding = this._getEncoding(mimeType);
            if (!encoding) {
                throw new Error(`Unsupported mime type: ${mimeType}`);
            }

            // Convertir buffer a base64
            const audioContent = audioBuffer.toString('base64');

            // Configurar request con parámetros optimizados
            const request = {
                audio: { content: audioContent },
                config: {
                    encoding: encoding,
                    sampleRateHertz: 48000, // Ajustado para WhatsApp
                    languageCode: 'es-ES',
                    model: 'default',
                    useEnhanced: true,
                    enableAutomaticPunctuation: true,
                    enableWordTimeOffsets: false,
                    metadata: {
                        audioTopic: 'legal consultation',
                        interactionType: 'whatsapp voice message'
                    },
                    maxAlternatives: 1
                }
            };

            logInfo('Sending transcription request to Google', {
                encoding,
                languageCode: request.config.languageCode
            });

            // Realizar la transcripción
            const [response] = await this.speechClient.recognize(request);

            // Validar respuesta
            if (!response.results || response.results.length === 0) {
                throw new Error('No transcription results received');
            }

            // Procesar y concatenar resultados
            const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join(' ');

            logInfo('Transcription completed successfully', {
                transcriptionLength: transcription.length,
                resultCount: response.results.length
            });

            return transcription;

        } catch (error) {
            logError('Transcription error', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    _getEncoding(mimeType) {
        const encodingMap = {
            'audio/ogg': 'OGG_OPUS',
            'audio/mpeg': 'MP3',
            'audio/mp4': 'MP4',
            'audio/wav': 'LINEAR16',
            'audio/x-wav': 'LINEAR16'
        };

        return encodingMap[mimeType];
    }

    async validateAudioFormat(buffer, mimeType) {
        try {
            if (!buffer || buffer.length === 0) {
                throw new Error('Empty audio buffer');
            }

            const supportedMimeTypes = [
                'audio/ogg',
                'audio/mpeg',
                'audio/mp4',
                'audio/wav',
                'audio/x-wav'
            ];

            if (!supportedMimeTypes.includes(mimeType)) {
                throw new Error(`Unsupported audio format: ${mimeType}`);
            }

            // Validar tamaño máximo (10MB)
            const maxSize = 10 * 1024 * 1024;
            if (buffer.length > maxSize) {
                throw new Error('Audio file too large');
            }

            return true;
        } catch (error) {
            logError('Audio validation error', {
                error: error.message,
                mimeType,
                bufferSize: buffer?.length
            });
            throw error;
        }
    }
}

// Exportar una instancia única
module.exports = new GoogleSTTService();