// src/services/conversation/ConversationProcessor.js
const { logError, logInfo } = require('../../utils/logger');
const queryClassifierService = require('../queryClassifierService');
const chatbaseClient = require('../../integrations/chatbaseClient');
const whatsappService = require('../whatsappService');

class ConversationProcessor {
    static getContextMessageByCategory(category) {
        const contextMessages = {
            servicios_publicos: "Hola, soy JULI. Estoy aquí para brindarte orientación en tus dudas o reclamos sobre servicios públicos domiciliarios. Por favor, describe detalladamente tu situación.",
            telecomunicaciones: "Hola, soy JULI. Estoy aquí para brindarte orientación en tus dudas o reclamos sobre telecomunicaciones. Por favor, describe detalladamente tu situación.",
            transporte_aereo: "Hola, soy JULI. Estoy aquí para brindarte orientación en tus dudas o reclamos sobre transporte aéreo. Por favor, describe detalladamente tu situación."
        };
        
        return contextMessages[category] || "";
    }

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
    
            // Si ya existe una categoría en la conversación, usarla
            let classification;
            if (conversation.currentCategory && conversation.currentCategory !== 'unknown') {
                classification = {
                    category: conversation.currentCategory,
                    confidence: 1.0  // Mantener la categoría con confianza máxima
                };
                logInfo('Usando categoría existente', { category: classification.category });
            } else {
                // Clasificar nuevo mensaje
                logInfo('Procesando mensaje subsiguiente - Activando clasificación');
                classification = await queryClassifierService.classifyQuery(content);
            }
    
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
                    // Verificar si es la primera interacción con Chatbase
                    const isFirstInteraction = !conversation.metadata.chatbaseInitialized;
                    
                    if (isFirstInteraction) {
                        conversation.metadata.chatbaseInitialized = true;
                        logInfo('Iniciando nueva conversación con Chatbase', {
                            category: classification.category
                        });
                    }
    
                    // Enviar mensaje a Chatbase
                    const chatbaseResponse = await chatbaseClient.getResponse(
                        content,
                        classification.category,
                        isFirstInteraction
                    );
    
                    // Procesar respuesta
                    if (chatbaseResponse && chatbaseResponse.content) {
                        await whatsappService.sendTextMessage(
                            message.from,
                            chatbaseResponse.content,
                            message.metadata?.phoneNumberId
                        );
    
                        logInfo('Respuesta de Chatbase enviada exitosamente', {
                            messageId: message.id,
                            category: classification.category,
                            responseLength: chatbaseResponse.content.length,
                            isFirstInteraction
                        });
    
                        this._addToProcessingHistory(conversation, {
                            messageId: message.id,
                            type: 'chatbase_response',
                            category: classification.category,
                            timestamp: new Date(),
                            success: true,
                            metadata: chatbaseResponse.metadata
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
    
                    await whatsappService.sendTextMessage(
                        message.from,
                        "Lo siento, estoy teniendo problemas para procesar tu consulta. Por favor, intenta nuevamente en unos momentos.",
                        message.metadata?.phoneNumberId
                    );
    
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
            logInfo('Iniciando procesamiento de audio', {
                messageId: message.id,
                audioId: message?.audio?.id,
                mimeType: message?.audio?.mime_type
            });
    
            // Validación básica del mensaje
            if (!message || !message.type === 'audio') {
                throw new Error('Mensaje no es de tipo audio');
            }
    
            // Extraer ID del audio de manera más flexible
            const audioId = message.audio?.id || message.media_id || message.voice?.id;
            if (!audioId) {
                throw new Error('No se pudo obtener el ID del audio');
            }
    
            // Enviar mensaje de estado
            await whatsappService.sendTextMessage(
                message.from,
                "🎧 Procesando tu mensaje de voz...",
                message.metadata?.phoneNumberId
            );
    
            try {
                // Obtener el contenido del audio
                const audioBuffer = await whatsappService.downloadMedia(audioId);
                
                if (!audioBuffer || audioBuffer.length === 0) {
                    throw new Error('Audio descargado está vacío');
                }
    
                // Determinar el formato del audio
                const mimeType = message.audio?.mime_type || 'audio/ogg; codecs=opus';
                
                // Transcribir el audio usando el servicio de Google
                const googleSTTService = require('../../integrations/googleSTT');
                const transcription = await googleSTTService.transcribeAudio(audioBuffer, mimeType);
    
                if (!transcription || transcription.trim().length === 0) {
                    throw new Error('No se pudo obtener transcripción del audio');
                }
    
                // Almacenar la transcripción
                if (!conversation.metadata.audioTranscriptions) {
                    conversation.metadata.audioTranscriptions = [];
                }
    
                conversation.metadata.audioTranscriptions.push({
                    messageId: message.id,
                    transcription: transcription,
                    timestamp: new Date(),
                    metadata: {
                        audioId: audioId,
                        mimeType: mimeType
                    }
                });
    
                // Enviar transcripción al usuario
                await whatsappService.sendTextMessage(
                    message.from,
                    `📝 Transcripción de tu mensaje:\n\n${transcription}`,
                    message.metadata?.phoneNumberId
                );
    
                // Procesar la transcripción como un mensaje de texto
                const classification = await queryClassifierService.classifyQuery(transcription);
                this._storeClassification(conversation, message.id, classification);
    
                // Procesar con Chatbase si la clasificación es válida
                if (classification.category !== 'unknown') {
                    const chatbaseResponse = await chatbaseClient.getResponse(
                        transcription,
                        classification.category
                    );
    
                    if (chatbaseResponse?.content) {
                        // Enviar respuesta como texto
                        await whatsappService.sendTextMessage(
                            message.from,
                            chatbaseResponse.content,
                            message.metadata?.phoneNumberId
                        );
                    }
                }
    
                return true;
    
            } catch (audioError) {
                logError('Error procesando audio', {
                    error: audioError.message,
                    messageId: message.id,
                    audioId: audioId
                });
                
                // Enviar mensaje de error específico
                await whatsappService.sendTextMessage(
                    message.from,
                    "Lo siento, hubo un problema al procesar tu mensaje de voz. " +
                    "Por favor, intenta enviarlo nuevamente o escribe tu mensaje como texto.",
                    message.metadata?.phoneNumberId
                );
                
                throw audioError;
            }
    
        } catch (error) {
            logError('Error en procesamiento de audio', {
                messageId: message.id,
                error: error.message,
                stack: error.stack
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