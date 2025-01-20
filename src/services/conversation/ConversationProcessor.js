// src/services/conversation/ConversationProcessor.js
const { logError, logInfo } = require('../../utils/logger');
const queryClassifierService = require('../queryClassifierService');
const chatbaseClient = require('../../integrations/chatbaseClient');
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

            // Detectar evento de eliminación
            if (this._isDeleteEvent(message)) {
                await this._handleChatReset(conversation, message);
                return true;
            }

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

    static _isDeleteEvent(message) {
        // Verificar diferentes patrones de eventos de eliminación
        return (
            (message.type === 'system' && message.system?.body?.includes('eliminado')) ||
            (message.type === 'notification' && message.notification?.type === 'message_deleted') ||
            message.status === 'deleted' ||
            message.event === 'message_deleted'
        );
    }

    static async _handleChatReset(conversation, message) {
        try {
            const lastCategory = conversation.currentCategory || 
                               conversation.metadata?.classifications?.slice(-1)[0]?.category;

            logInfo('Detectado evento de eliminación', {
                conversationId: conversation.id,
                lastCategory,
                messageId: message.id
            });

            if (lastCategory && lastCategory !== 'unknown') {
                // Reiniciar chat en Chatbase
                await chatbaseClient.resetChat(lastCategory);

                // Limpiar historial de clasificaciones
                conversation.metadata.classifications = [];
                conversation.currentCategory = null;
                conversation.lastClassification = null;

                // Registrar el reinicio
                this._addToProcessingHistory(conversation, {
                    type: 'chat_reset',
                    timestamp: new Date(),
                    category: lastCategory,
                    success: true,
                    trigger: 'message_deleted'
                });

                // Enviar mensaje al usuario
                await whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "La conversación ha sido reiniciada. ¿En qué puedo ayudarte?",
                    conversation.metadata?.phoneNumberId
                );

                logInfo('Chat reiniciado exitosamente', {
                    conversationId: conversation.id,
                    category: lastCategory
                });
            }
        } catch (error) {
            logError('Error al reiniciar chat', {
                error: error.message,
                conversationId: conversation.id
            });

            this._addToProcessingHistory(conversation, {
                type: 'chat_reset_error',
                timestamp: new Date(),
                error: error.message
            });
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

            logInfo('Mensaje clasificado exitosamente', {
                messageId: message.id,
                category: classification.category,
                confidence: classification.confidence,
                conversationId: conversation.id
            });

            // Si la categoría es válida, procesar con Chatbase
            if (classification.category !== 'unknown') {
                try {
                    logInfo('Iniciando consulta a Chatbase', {
                        messageId: message.id,
                        category: classification.category
                    });

                    // Obtener respuesta de Chatbase
                    const chatbaseResponse = await chatbaseClient.getResponse(
                        content,
                        classification.category
                    );

                    // Verificar y procesar la respuesta
                    if (chatbaseResponse && chatbaseResponse.content) {
                        // Enviar respuesta al usuario vía WhatsApp
                        await whatsappService.sendTextMessage(
                            message.from,
                            chatbaseResponse.content,
                            message.metadata?.phoneNumberId
                        );

                        logInfo('Respuesta de Chatbase enviada exitosamente', {
                            messageId: message.id,
                            category: classification.category,
                            responseLength: chatbaseResponse.content.length
                        });

                        // Almacenar la respuesta en el historial
                        this._addToProcessingHistory(conversation, {
                            messageId: message.id,
                            type: 'chatbase_response',
                            category: classification.category,
                            timestamp: new Date(),
                            success: true
                        });
                    } else {
                        throw new Error('Respuesta de Chatbase inválida o vacía');
                    }
                } catch (chatError) {
                    logError('Error en la comunicación con Chatbase', {
                        error: chatError.message,
                        category: classification.category,
                        messageId: message.id
                    });

                    // Enviar mensaje de error al usuario
                    await whatsappService.sendTextMessage(
                        message.from,
                        "Lo siento, estoy teniendo problemas para procesar tu consulta. Por favor, intenta nuevamente en unos momentos.",
                        message.metadata?.phoneNumberId
                    );

                    // Registrar el error en el historial
                    this._addToProcessingHistory(conversation, {
                        messageId: message.id,
                        type: 'chatbase_error',
                        category: classification.category,
                        timestamp: new Date(),
                        success: false,
                        error: chatError.message
                    });
                }
            }

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

            // Procesar con Chatbase si la clasificación es válida
            if (classification.category !== 'unknown') {
                try {
                    const chatbaseResponse = await chatbaseClient.getResponse(
                        mockTranscription,
                        classification.category
                    );

                    if (chatbaseResponse && chatbaseResponse.content) {
                        await whatsappService.sendTextMessage(
                            message.from,
                            chatbaseResponse.content,
                            message.metadata?.phoneNumberId
                        );
                    }
                } catch (error) {
                    logError('Error procesando audio en Chatbase', {
                        messageId: message.id,
                        error: error.message
                    });
                }
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