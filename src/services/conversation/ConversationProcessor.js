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

            // Actualizar intentos de procesamiento
            message.attempts = (message.attempts || 0) + 1;
            message.lastAttempt = new Date();

            // Procesar según el tipo de mensaje
            if (message.type === 'text') {
                await this.processTextMessage(message, conversation);
            } else if (message.type === 'audio') {
                await this.processAudioMessage(message, conversation);
            } else if (message.type === 'document') {
                await this.processDocumentMessage(message, conversation);
            } else {
                throw new Error(`Tipo de mensaje no soportado: ${message.type}`);
            }
            
            // Marcar como procesado exitosamente
            message.processed = true;
            message.error = null;

            // Registrar en el historial de procesamiento
            this._addToProcessingHistory(conversation, {
                messageId: message.id,
                type: message.type,
                timestamp: new Date(),
                success: true
            });
            
            return true;

        } catch (error) {
            this._handleProcessingError(message, conversation, error);
            return false;
        }
    }

    static async processTextMessage(message, conversation) {
        try {
            const content = typeof message.text === 'object' ? 
                message.text.body : message.text;

            logInfo('Procesando mensaje de texto', {
                messageId: message.id,
                contentLength: content?.length
            });

            // Verificar si es el primer mensaje
            if (this._isFirstMessage(conversation)) {
                logInfo('Procesando primer mensaje - Solo bienvenida', { content });
                return;
            }

            // Clasificar mensaje subsiguiente
            logInfo('Procesando mensaje subsiguiente - Activando clasificación');
            const classification = await queryClassifierService.classifyQuery(content);

            // Almacenar resultado de clasificación
            if (!conversation.metadata.classifications) {
                conversation.metadata.classifications = [];
            }

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

        } catch (error) {
            logError('Error en procesamiento de mensaje de texto', {
                messageId: message.id,
                error: error.message
            });
            throw error;
        }
    }

    static async processAudioMessage(message, conversation) {
        try {
            logInfo('Procesando mensaje de audio', {
                messageId: message.id,
                audioId: message.audio?.id
            });

            if (!conversation.metadata.audioTranscriptions) {
                conversation.metadata.audioTranscriptions = [];
            }

            // Aquí iría la lógica de transcripción real
            const mockTranscription = "Transcripción simulada para pruebas";
            
            conversation.metadata.audioTranscriptions.push({
                messageId: message.id,
                transcription: mockTranscription,
                timestamp: new Date()
            });

        } catch (error) {
            logError('Error en procesamiento de audio', {
                messageId: message.id,
                error: error.message
            });
            throw error;
        }
    }

    static async processDocumentMessage(message, conversation) {
        try {
            logInfo('Procesando documento', {
                messageId: message.id,
                documentId: message.document?.id
            });
        } catch (error) {
            logError('Error en procesamiento de documento', {
                messageId: message.id,
                error: error.message
            });
            throw error;
        }
    }

    static _isFirstMessage(conversation) {
        return !conversation.messages || conversation.messages.length === 0;
    }

    static _handleProcessingError(message, conversation, error) {
        message.error = error.message;
        message.processed = false;

        logError('Error procesando mensaje', {
            messageId: message.id,
            type: message.type,
            error: error.message
        });

        this._addToProcessingHistory(conversation, {
            messageId: message.id,
            type: message.type,
            timestamp: new Date(),
            success: false,
            error: error.message
        });
    }

    static _addToProcessingHistory(conversation, entry) {
        if (!conversation.metadata.processingHistory) {
            conversation.metadata.processingHistory = [];
        }
        conversation.metadata.processingHistory.push(entry);
    }
}

module.exports = ConversationProcessor;