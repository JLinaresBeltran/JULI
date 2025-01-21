// src/integrations/googleSTT.js
const speech = require('@google-cloud/speech');
const { spawn } = require('child_process');
const { logInfo, logError } = require('../utils/logger');
const util = require('util');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);

class GoogleSTTService {
    constructor() {
        try {
            this.client = new speech.SpeechClient({
                keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
            });
            logInfo('Google STT Service initialized');
        } catch (error) {
            logError('Error initializing Google STT Service', { error });
            throw error;
        }
    }

    async convertOggToRaw(audioBuffer) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', 'pipe:0',        // Input from pipe
                '-f', 's16le',         // Output format: 16-bit little-endian
                '-acodec', 'pcm_s16le', // Audio codec
                '-ar', '16000',        // Sample rate
                '-ac', '1',            // Mono channel
                'pipe:1'               // Output to pipe
            ]);

            const chunks = [];
            
            ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
            ffmpeg.stderr.on('data', data => logInfo('FFmpeg:', data.toString()));
            
            ffmpeg.on('exit', code => {
                if (code === 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            ffmpeg.stdin.write(audioBuffer);
            ffmpeg.stdin.end();
        });
    }

    async transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
        try {
            logInfo('Iniciando transcripción de audio', {
                bufferSize: audioBuffer.length,
                mimeType
            });

            // Si es audio OGG (formato de WhatsApp), convertir a RAW
            let processedBuffer = audioBuffer;
            if (mimeType.includes('ogg')) {
                logInfo('Convirtiendo audio OGG a RAW');
                processedBuffer = await this.convertOggToRaw(audioBuffer);
            }

            const audioBytes = processedBuffer.toString('base64');
            
            const config = {
                encoding: 'LINEAR16',
                sampleRateHertz: 16000,
                languageCode: 'es-ES',
                enableAutomaticPunctuation: true,
                model: 'default',
                useEnhanced: true
            };

            const request = {
                audio: { content: audioBytes },
                config: config
            };

            logInfo('Enviando solicitud a Google Speech-to-Text');
            const [response] = await this.client.recognize(request);

            if (!response.results || response.results.length === 0) {
                throw new Error('No se obtuvieron resultados de transcripción');
            }

            const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n');

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
    }
}

// Exportar una única instancia del servicio
module.exports = new GoogleSTTService();