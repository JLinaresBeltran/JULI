// src/services/conversation/ConversationProcessor.js
const { logError, logInfo } = require('../../utils/logger');
const queryClassifierService = require('../queryClassifierService');

class ConversationProcessor {
    static async processMessage(message, conversation) {
        try {
            // Inicializar metadata si no existe
            if (!conversation.metadata) {
                conversation.metadata = {
                    audioTranscriptions: [],
                    classifications: [],
                    processingHistory: []
                };
            }

            const processors = {
                text: this.processTextMessage,
                audio: this.processAudioMessage,
                document: this.processDocumentMessage
            };

            const processor = processors[message.type];
            if (!processor) {
                throw new Error(`Tipo de mensaje no soportado: ${message.type}`);
            }

            // Actualizar intentos de procesamiento
            message.attempts = (message.attempts || 0) + 1;
            message.lastAttempt = new Date();

            // Procesar el mensaje
            await processor.call(this, message, conversation);
            
            // Marcar como procesado exitosamente
            message.processed = true;
            message.error = null;

            // Registrar en el historial de procesamiento
            conversation.metadata.processingHistory.push({
                messageId: message.id,
                type: message.type,
                timestamp: new Date(),
                success: true
            });
            
            return true;

        } catch (error) {
            message.error = error.message;
            logError('Error procesando mensaje', {
                messageId: message.id,
                type: message.type,
                error: error.message
            });

            // Registrar el error en el historial
            if (conversation.metadata?.processingHistory) {
                conversation.metadata.processingHistory.push({
                    messageId: message.id,
                    type: message.type,
                    timestamp: new Date(),
                    success: false,
                    error: error.message
                });
            }

            return false;
        }
    }

    static async processTextMessage(message, conversation) {
        try {
            const content = typeof message.text === 'object' ? 
                message.text.body : message.text;

            logInfo('Procesando mensaje de texto', {
                messageId: message.id,
                contentLength: content.length
            });

            // Verificar si es el primer mensaje
            const isFirstMessage = this._isFirstMessage(conversation);
            if (isFirstMessage) {
                logInfo('Procesando primer mensaje - Solo bienvenida');
                return true;
            }

            // Clasificar mensaje subsiguiente
            logInfo('Procesando mensaje subsiguiente - Activando clasificación');
            const classification = await queryClassifierService.classifyQuery(content);

            // Almacenar resultado de clasificación
            conversation.metadata.classifications.push({
                messageId: message.id,
                timestamp: new Date(),
                ...classification
            });

            // Actualizar estado de la conversación
            conversation.currentCategory = classification.category;
            conversation.lastClassification = {
                timestamp: new Date(),
                ...classification
            };

            logInfo('Mensaje clasificado exitosamente', {
                messageId: message.id,
                category: classification.category,
                confidence: classification.confidence
            });

            return true;

        } catch (error) {
            throw new Error(`Error procesando mensaje de texto: ${error.message}`);
        }
    }

    static async processAudioMessage(message, conversation) {
        try {
            logInfo('Procesando mensaje de audio', {
                messageId: message.id,
                audioId: message.audio?.id
            });

            // Implementar la transcripción real aquí
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
            logInfo('Procesando documento', {
                messageId: message.id,
                documentId: message.document?.id
            });
            return true;
        } catch (error) {
            throw new Error(`Error procesando documento: ${error.message}`);
        }
    }

    static _isFirstMessage(conversation) {
        return !conversation.messages || conversation.messages.length === 0;
    }
}

module.exports = ConversationProcessor;