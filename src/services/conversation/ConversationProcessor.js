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
    
            if (this._isFirstMessage(conversation)) {
                logInfo('Procesando primer mensaje - Solo bienvenida', { content });
                return;
            }
    
            let classification;
            if (conversation.currentCategory && conversation.currentCategory !== 'unknown') {
                classification = {
                    category: conversation.currentCategory,
                    confidence: 1.0
                };
                logInfo('Usando categoría existente', { category: classification.category });
            } else {
                logInfo('Procesando mensaje subsiguiente - Activando clasificación');
                classification = await queryClassifierService.classifyQuery(content);
            }
    
            this._storeClassification(conversation, message.id, classification);
    
            logInfo('Mensaje clasificado exitosamente', {
                messageId: message.id,
                category: classification.category,
                confidence: classification.confidence,
                conversationId: conversation.id
            });
    
            if (classification.category !== 'unknown') {
                try {
                    const isFirstInteraction = !conversation.metadata.chatbaseInitialized;
                    
                    if (isFirstInteraction) {
                        conversation.metadata.chatbaseInitialized = true;
                        logInfo('Iniciando nueva conversación con Chatbase', {
                            category: classification.category
                        });
                    }
    
                    const chatbaseResponse = await chatbaseClient.getResponse(
                        content,
                        classification.category,
                        isFirstInteraction
                    );
    
                    if (chatbaseResponse && chatbaseResponse.content) {
                        const responseContent = chatbaseResponse.content;

                        // Verificar si la respuesta contiene la frase clave
                        if (responseContent.includes("Esto es correcto o falta algo")) {
                            try {
                                logInfo('Detectada frase clave para TTS - Iniciando conversión', {
                                    textLength: responseContent.length
                                });
                                
                                const audioBuffer = await synthesizeSpeech(responseContent);
                                
                                await whatsappService.sendVoiceMessage(
                                    message.from,
                                    audioBuffer,
                                    message.metadata?.phoneNumberId
                                );

                                logInfo('Audio enviado exitosamente', {
                                    messageId: message.id,
                                    category: classification.category,
                                    audioSize: audioBuffer.length
                                });
                            } catch (ttsError) {
                                logError('Error en conversión a voz', {
                                    error: ttsError.message,
                                    messageId: message.id
                                });
                                
                                // Si falla el audio, enviar como texto
                                await whatsappService.sendTextMessage(
                                    message.from,
                                    responseContent,
                                    message.metadata?.phoneNumberId
                                );
                            }
                        } else {
                            // Enviar respuesta normal como texto
                            await whatsappService.sendTextMessage(
                                message.from,
                                responseContent,
                                message.metadata?.phoneNumberId
                            );
                        }
    
                        logInfo('Respuesta de Chatbase procesada', {
                            messageId: message.id,
                            category: classification.category,
                            responseLength: responseContent.length,
                            isFirstInteraction,
                            wasAudio: responseContent.includes("Esto es correcto o falta algo")
                        });
    
                        this._addToProcessingHistory(conversation, {
                            messageId: message.id,
                            type: responseContent.includes("Esto es correcto o falta algo") ? 
                                  'voice_response' : 'chatbase_response',
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
                audioId: message?.audio?.id
            });
    
            // Validación básica
            if (!message?.audio?.id) {
                throw new Error('Audio ID no encontrado');
            }
    
            // Notificar inicio de procesamiento
            await whatsappService.sendTextMessage(
                message.from,
                "🎧 Procesando tu mensaje de voz...",
                message.metadata?.phoneNumberId
            );
    
            // Descargar audio
            const audioBuffer = await whatsappService.downloadMedia(message.audio.id);
            
            if (!audioBuffer || audioBuffer.length === 0) {
                throw new Error('Error al descargar el audio');
            }
    
            // Transcribir audio
            const googleSTTService = require('../../integrations/googleSTT');
            const transcription = await googleSTTService.transcribeAudio(
                audioBuffer,
                message.audio.mime_type || 'audio/ogg'
            );
    
            // Almacenar transcripción
            if (!conversation.metadata.audioTranscriptions) {
                conversation.metadata.audioTranscriptions = [];
            }
    
            conversation.metadata.audioTranscriptions.push({
                messageId: message.id,
                transcription,
                timestamp: new Date()
            });
    
            // Enviar transcripción al usuario
            await whatsappService.sendTextMessage(
                message.from,
                `📝 Tu mensaje dice:\n\n${transcription}`,
                message.metadata?.phoneNumberId
            );
    
            // Clasificar y procesar como mensaje normal
            const classification = await queryClassifierService.classifyQuery(transcription);
            
            if (classification.category !== 'unknown') {
                const chatbaseResponse = await chatbaseClient.getResponse(
                    transcription,
                    classification.category
                );
    
                if (chatbaseResponse?.content) {
                    await whatsappService.sendTextMessage(
                        message.from,
                        chatbaseResponse.content,
                        message.metadata?.phoneNumberId
                    );
                }
            }
    
            return true;
    
        } catch (error) {
            logError('Error procesando mensaje de audio', {
                error: error.message,
                messageId: message.id
            });
            
    
            await whatsappService.sendTextMessage(
                message.from,
                "Lo siento, no pude procesar tu mensaje de voz correctamente. " +
                "¿Podrías intentar enviarlo de nuevo o escribir tu mensaje?",
                message.metadata?.phoneNumberId
            );
    
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