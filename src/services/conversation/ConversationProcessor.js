// src/services/conversation/ConversationProcessor.js
const { logError, logInfo } = require('../../utils/logger');

class ConversationProcessor {
    static async processMessage(message, conversation) {
        try {
            const processors = {
                text: this.processTextMessage,
                audio: this.processAudioMessage,
                document: this.processDocumentMessage
            };

            const processor = processors[message.type];
            if (!processor) {
                throw new Error(`Tipo de mensaje no soportado: ${message.type}`);
            }

            message.attempts = (message.attempts || 0) + 1;
            message.lastAttempt = new Date();

            await processor.call(this, message, conversation);
            
            message.processed = true;
            message.error = null;
            
            return true;
        } catch (error) {
            message.error = error.message;
            logError('Error procesando mensaje', {
                messageId: message.id,
                type: message.type,
                error: error.message
            });
            return false;
        }
    }

    static async processTextMessage(message, conversation) {
        try {
            logInfo('Procesando mensaje de texto', {
                messageId: message.id,
                // Extraer directamente el texto
                content: typeof message.text === 'object' ? 
                    message.text.body : message.text
            });
            return true;
        } catch (error) {
            throw new Error(`Error procesando mensaje de texto: ${error.message}`);
        }
    }

    static async processAudioMessage(message, conversation) {
        try {
            // Mock de transcripción para pruebas
            logInfo('Procesando mensaje de audio', {
                messageId: message.id,
                audioId: message.audio?.id
            });

            const mockTranscription = "Transcripción simulada para pruebas";
            
            conversation.metadata.audioTranscriptions.push({
                messageId: message.id,
                transcription: mockTranscription,
                timestamp: new Date()
            });

            return true;
        } catch (error) {
            throw new Error(`Error procesando mensaje de audio: ${error.message}`);
        }
    }

    static async processDocumentMessage(message, conversation) {
        try {
            // Mock de procesamiento de documento para pruebas
            logInfo('Procesando documento', {
                messageId: message.id,
                documentId: message.document?.id
            });
            return true;
        } catch (error) {
            throw new Error(`Error procesando documento: ${error.message}`);
        }
    }
}

module.exports = ConversationProcessor;