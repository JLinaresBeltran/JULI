const { logError, logInfo } = require('../../utils/logger');
const queryClassifierService = require('../queryClassifierService');
const chatbaseClient = require('../../integrations/chatbaseClient');
const whatsappService = require('../whatsappService');
const googleTTSService = require('../../integrations/googleTTS');
const googleSTTService = require('../../integrations/googleSTT');

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
            if (!conversation.metadata) {
                conversation.metadata = {
                    audioTranscriptions: [],
                    classifications: [],
                    processingHistory: [],
                    lastTTSTime: null
                };
            }

            message.attempts = (message.attempts || 0) + 1;
            message.lastAttempt = new Date();

            if (this._isDeleteEvent(message)) {
                await this._handleChatReset(conversation, message);
                return true;
            }

            let success = false;
            switch (message.type) {
                case 'text':
                    success = await this.processTextMessage(message, conversation);
                    break;
                case 'audio':
                    success = await this.processAudioMessage(message, conversation);
                    break;
                case 'document':
                    success = await this.processDocumentMessage(message, conversation);
                    break;
                default:
                    throw new Error(`Tipo de mensaje no soportado: ${message.type}`);
            }

            if (success) {
                message.processed = true;
                message.error = null;
                this._addToProcessingHistory(conversation, {
                    messageId: message.id,
                    type: message.type,
                    timestamp: new Date(),
                    success: true
                });
            }

            return success;
        } catch (error) {
            this._handleProcessingError(message, conversation, error);
            return false;
        }
    }

    static async processTextMessage(message, conversation) {
        try {
            const content = typeof message.text === 'object' ? message.text.body : message.text;
            
            logInfo('Procesando mensaje de texto', {
                messageId: message.id,
                contentLength: content?.length
            });

            if (this._isFirstMessage(conversation)) {
                logInfo('Procesando primer mensaje - Solo bienvenida', { content });
                return true;
            }

            const classification = await this._getClassification(conversation, content);
            if (!classification) return false;

            this._storeClassification(conversation, message.id, classification);

            if (classification.category === 'unknown') return true;

            try {
                const chatbaseResponse = await this._getChatbaseResponse(content, classification, conversation);
                if (!chatbaseResponse?.content) throw new Error('Respuesta de Chatbase inválida');

                await this._handleChatbaseResponse(message, chatbaseResponse, classification, conversation);
                return true;
            } catch (error) {
                await this._handleChatError(message, error, conversation);
                return false;
            }
        } catch (error) {
            logError('Error en procesamiento de texto', { error: error.message });
            throw error;
        }
    }

    static async processAudioMessage(message, conversation) {
        try {
            if (!message?.audio?.id) throw new Error('Audio ID no encontrado');

            await whatsappService.sendTextMessage(
                message.from,
                "🎧 Procesando tu mensaje de voz...",
                message.metadata?.phoneNumberId
            );

            const audioBuffer = await whatsappService.downloadMedia(message.audio.id);
            if (!audioBuffer?.length) throw new Error('Error al descargar el audio');

            const transcription = await googleSTTService.transcribeAudio(
                audioBuffer,
                message.audio.mime_type || 'audio/ogg'
            );

            this._storeAudioTranscription(conversation, message.id, transcription);

            await whatsappService.sendTextMessage(
                message.from,
                `📝 Tu mensaje dice:\n\n${transcription}`,
                message.metadata?.phoneNumberId
            );

            const classification = await queryClassifierService.classifyQuery(transcription);
            
            if (classification.category !== 'unknown') {
                const chatbaseResponse = await chatbaseClient.getResponse(
                    transcription,
                    classification.category
                );

                if (chatbaseResponse?.content) {
                    await this._handleChatbaseResponse(message, chatbaseResponse, classification, conversation);
                }
            }

            return true;
        } catch (error) {
            logError('Error en audio', { error: error.message });
            await this._handleAudioError(message, error);
            throw error;
        }
    }

    static async _handleChatbaseResponse(message, chatbaseResponse, classification, conversation) {
        const content = chatbaseResponse.content;
        const shouldUseTTS = this._shouldUseTTS(content, conversation);

        try {
            if (shouldUseTTS) {
                logInfo('Iniciando TTS', { textLength: content.length });

                const audioBuffer = await googleTTSService.synthesizeSpeech(content);
                await whatsappService.sendVoiceMessage(
                    message.from,
                    audioBuffer,
                    message.metadata?.phoneNumberId
                );

                conversation.metadata.lastTTSTime = new Date();
            } else {
                await whatsappService.sendTextMessage(
                    message.from,
                    content,
                    message.metadata?.phoneNumberId
                );
            }

            this._addToProcessingHistory(conversation, {
                messageId: message.id,
                type: shouldUseTTS ? 'voice_response' : 'text_response',
                category: classification.category,
                timestamp: new Date(),
                success: true
            });
        } catch (error) {
            if (shouldUseTTS) {
                logError('Error TTS - fallback a texto', { error: error.message });
                await whatsappService.sendTextMessage(
                    message.from,
                    content,
                    message.metadata?.phoneNumberId
                );
            }
            throw error;
        }
    }

    static _shouldUseTTS(content, conversation) {
        const hasKeyPhrase = content.toLowerCase().includes('esto es correcto o falta algo');
        const now = new Date();
        const lastTTS = conversation.metadata.lastTTSTime;
        const minTimeBetweenTTS = 30000; // 30 segundos

        return hasKeyPhrase && (!lastTTS || (now - new Date(lastTTS)) > minTimeBetweenTTS);
    }

    static async _getChatbaseResponse(content, classification, conversation) {
        const isFirstInteraction = !conversation.metadata.chatbaseInitialized;
        if (isFirstInteraction) {
            conversation.metadata.chatbaseInitialized = true;
        }

        return await chatbaseClient.getResponse(
            content,
            classification.category,
            isFirstInteraction
        );
    }

    static async _getClassification(conversation, content) {
        if (conversation.currentCategory && conversation.currentCategory !== 'unknown') {
            return {
                category: conversation.currentCategory,
                confidence: 1.0
            };
        }
        return await queryClassifierService.classifyQuery(content);
    }

    static _storeAudioTranscription(conversation, messageId, transcription) {
        if (!conversation.metadata.audioTranscriptions) {
            conversation.metadata.audioTranscriptions = [];
        }
        
        conversation.metadata.audioTranscriptions.push({
            messageId,
            transcription,
            timestamp: new Date()
        });
    }

    static async _handleChatError(message, error, conversation) {
        logError('Error de chat', { error: error.message });
        
        await whatsappService.sendTextMessage(
            message.from,
            "Lo siento, estoy teniendo problemas para procesar tu consulta. Por favor, intenta nuevamente en unos momentos.",
            message.metadata?.phoneNumberId
        );

        this._addToProcessingHistory(conversation, {
            messageId: message.id,
            type: 'chat_error',
            timestamp: new Date(),
            success: false,
            error: error.message
        });
    }

    static async _handleAudioError(message, error) {
        await whatsappService.sendTextMessage(
            message.from,
            "Lo siento, no pude procesar tu mensaje de voz correctamente. ¿Podrías intentar enviarlo de nuevo o escribir tu mensaje?",
            message.metadata?.phoneNumberId
        );
    }

    // ... mantener los métodos auxiliares existentes (_isDeleteEvent, _handleChatReset, etc.) ...
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

            if (lastCategory && lastCategory !== 'unknown') {
                await chatbaseClient.resetChat(lastCategory);
                conversation.metadata.classifications = [];
                conversation.currentCategory = null;
                conversation.lastClassification = null;

                this._addToProcessingHistory(conversation, {
                    type: 'chat_reset',
                    timestamp: new Date(),
                    category: lastCategory,
                    success: true,
                    trigger: 'message_deleted'
                });

                await whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "La conversación ha sido reiniciada. ¿En qué puedo ayudarte?",
                    conversation.metadata?.phoneNumberId
                );
            }
        } catch (error) {
            this._addToProcessingHistory(conversation, {
                type: 'chat_reset_error',
                timestamp: new Date(),
                error: error.message
            });
            throw error;
        }
    }

    static async processDocumentMessage(message, conversation) {
        try {
            logInfo('Procesando documento', {
                messageId: message.id,
                documentId: message.document?.id,
            });
            return true;
        } catch (error) {
            logError('Error en documento', { error: error.message });
            throw error;
        }
    }

    static _storeClassification(conversation, messageId, classification) {
        if (!conversation.metadata.classifications) {
            conversation.metadata.classifications = [];
        }

        conversation.metadata.classifications.push({
            messageId,
            timestamp: new Date(),
            ...classification
        });

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
            error: error.message
        });
    }

    static _isFirstMessage(conversation) {
        return !conversation.messages || conversation.messages.length === 0;
    }
}

module.exports = ConversationProcessor;