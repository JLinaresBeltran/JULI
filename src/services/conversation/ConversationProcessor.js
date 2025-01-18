// src/services/conversation/ConversationProcessor.js
const { logError, logInfo } = require('../../utils/logger');
const queryClassifierService = require('../queryClassifierService');
const chatbaseClient = require('../integrations/chatbaseClient');
const whatsappService = require('../whatsappService');

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
                contentLength: content?.length,
                conversationId: conversation.id
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
            this._storeClassification(conversation, message.id, classification);

            // Si la clasificación fue exitosa (no es UNKNOWN), procesar con Chatbase
            if (classification.category !== 'unknown' && classification.confidence >= 1) {
                await this._processChatbaseResponse(conversation, content, classification);
            }

            logInfo('Mensaje clasificado exitosamente', {
                messageId: message.id,
                category: classification.category,
                confidence: classification.confidence,
                conversationId: conversation.id
            });

        } catch (error) {
            logError('Error en procesamiento de mensaje de texto', {
                messageId: message.id,
                error: error.message,
                conversationId: conversation.id
            });
            throw error;
        }
    }

    static async processAudioMessage(message, conversation) {
        try {
            logInfo('Procesando mensaje de audio', {
                messageId: message.id,
                audioId: message.audio?.id,
                conversationId: conversation.id
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

            // Clasificar la transcripción
            const classification = await queryClassifierService.classifyQuery(mockTranscription);
            this._storeClassification(conversation, message.id, classification);

            if (classification.category !== 'unknown' && classification.confidence >= 1) {
                await this._processChatbaseResponse(conversation, mockTranscription, classification);
            }

        } catch (error) {
            logError('Error en procesamiento de audio', {
                messageId: message.id,
                error: error.message,
                conversationId: conversation.id
            });
            throw error;
        }
    }

    static async processDocumentMessage(message, conversation) {
        try {
            logInfo('Procesando documento', {
                messageId: message.id,
                documentId: message.document?.id,
                conversationId: conversation.id
            });
            
            // Aquí iría la lógica específica para procesamiento de documentos
            return true;
        } catch (error) {
            logError('Error en procesamiento de documento', {
                messageId: message.id,
                error: error.message,
                conversationId: conversation.id
            });
            throw error;
        }
    }

    static async _processChatbaseResponse(conversation, userMessage, classification) {
        try {
            // Obtener configuración de Chatbase según la categoría
            const config = queryClassifierService.getChatbaseConfig(classification.category);
            
            // Obtener respuesta de Chatbase
            const chatbaseResponse = await chatbaseClient.getResponse(userMessage, config);
            
            if (chatbaseResponse && chatbaseResponse.content) {
                // Enviar respuesta por WhatsApp
                await whatsappService.sendMessage({
                    to: conversation.whatsappId,
                    type: 'text',
                    text: { body: chatbaseResponse.content }
                });

                // Registrar la respuesta en el historial
                this._addToProcessingHistory(conversation, {
                    type: 'chatbase_response',
                    category: classification.category,
                    timestamp: new Date(),
                    success: true,
                    responseLength: chatbaseResponse.content.length
                });

                logInfo('Respuesta de Chatbase enviada', {
                    conversationId: conversation.id,
                    category: classification.category,
                    responseLength: chatbaseResponse.content.length
                });
            }
        } catch (error) {
            logError('Error procesando respuesta de Chatbase', {
                error: error.message,
                category: classification.category,
                conversationId: conversation.id
            });
            throw error;
        }
    }

    static _storeClassification(conversation, messageId, classification) {
        if (!conversation.metadata.classifications) {
            conversation.metadata.classifications = [];
        }

        // Guardar la clasificación en el historial
        conversation.metadata.classifications.push({
            messageId,
            timestamp: new Date(),
            ...classification
        });

        // Actualizar el estado actual de la conversación
        conversation.currentCategory = classification.category;
        conversation.lastClassification = {
            timestamp: new Date(),
            ...classification
        };
    }

    static _addToProcessingHistory(conversation, entry) {
        if (!conversation.metadata.processingHistory) {
            conversation.metadata.processingHistory = [];
        }
        conversation.metadata.processingHistory.push(entry);
    }

    static _handleProcessingError(message, conversation, error) {
        message.error = error.message;
        message.processed = false;

        this._addToProcessingHistory(conversation, {
            messageId: message.id,
            type: message.type,
            timestamp: new Date(),
            success: false,
            error: error.message
        });

        logError('Error procesando mensaje', {
            messageId: message.id,
            type: message.type,
            error: error.message,
            conversationId: conversation.id
        });
    }

    static _isFirstMessage(conversation) {
        return !conversation.messages || conversation.messages.length === 0;
    }
}

module.exports = ConversationProcessor;