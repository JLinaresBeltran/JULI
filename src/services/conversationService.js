const { transcribeAudio, synthesizeText } = require('../integrations/googleSTT');
const { sendMessageToChatbase } = require('../integrations/chatbaseClient');
const { logInfo, logError, logDebug } = require('../utils/logger');
const EventEmitter = require('events');

function validateWhatsAppMessage(message) {
    try {
        // Validación básica
        if (!message || !message.from || !message.id) {
            logError('Mensaje de WhatsApp inválido - campos básicos faltantes', {
                hasMessage: !!message,
                hasFrom: message?.from,
                hasId: message?.id,
                messageContent: message
            });
            return false;
        }

        // Validación del tipo de mensaje
        if (!message.type) {
            logError('Tipo de mensaje faltante', { messageId: message.id });
            return false;
        }

        // Validación por tipo
        switch (message.type) {
            case 'text':
                if (!message.text?.body) {
                    logError('Estructura de mensaje de texto inválida', {
                        messageId: message.id,
                        hasText: !!message.text,
                        hasBody: !!message.text?.body
                    });
                    return false;
                }
                break;

            case 'audio':
                if (!message.audio?.id) {
                    logError('Estructura de mensaje de audio inválida', { 
                        messageId: message.id,
                        hasAudio: !!message.audio 
                    });
                    return false;
                }
                break;

            case 'document':
                if (!message.document?.id) {
                    logError('Estructura de mensaje de documento inválida', { 
                        messageId: message.id,
                        hasDocument: !!message.document 
                    });
                    return false;
                }
                break;

            default:
                logError('Tipo de mensaje no soportado', {
                    messageId: message.id,
                    type: message.type
                });
                return false;
        }

        // Log de éxito usando logInfo en lugar de logDebug
        logInfo('Mensaje validado exitosamente', {
            messageId: message.id,
            type: message.type,
            from: message.from
        });

        return true;

    } catch (error) {
        logError('Error durante la validación del mensaje', {
            error: error.message,
            messageId: message?.id,
            messageType: message?.type,
            stack: error.stack
        });
        return false;
    }
}

class Conversation {
    constructor(whatsappId, userPhoneNumber) {
        this.whatsappId = whatsappId;
        this.userPhoneNumber = userPhoneNumber;
        this.messages = [];
        this.startTime = new Date();
        this.lastUpdateTime = new Date();
        this.status = 'active';
        this.metadata = {
            userProfile: null,
            currentIntent: null,
            documentGenerated: false,
            lastProcessedMessageId: null,
            audioTranscriptions: [],
            lastActivity: new Date(),
            messageCount: 0,
            hasUnreadMessages: false,
            reconnectAttempts: 0,
            lastHeartbeat: new Date(),
            processingErrors: []
        };
    }

    addMessage(message) {
        try {
            const formattedMessage = {
                id: message.id,
                timestamp: message.timestamp,
                type: message.type,
                direction: message.direction,
                content: message.text || message.audio || message.document || '',
                status: message.status || 'received',
                processed: false,
                attempts: 0,
                lastAttempt: null,
                error: null
            };

            this.messages.push(formattedMessage);
            this.lastUpdateTime = new Date();
            this.metadata.messageCount++;
            this.metadata.lastActivity = new Date();
            this.metadata.hasUnreadMessages = true;

            logInfo('Mensaje añadido a la conversación', {
                whatsappId: this.whatsappId,
                messageId: formattedMessage.id,
                type: formattedMessage.type,
                direction: formattedMessage.direction,
                timestamp: formattedMessage.timestamp
            });

            return true;
        } catch (error) {
            logError('Error al añadir mensaje a la conversación', {
                error: error.message,
                whatsappId: this.whatsappId,
                messageId: message?.id
            });
            return false;
        }
    }

    get isActive() {
        return this.status === 'active';
    }

    get hasUnprocessedMessages() {
        return this.messages.some(m => !m.processed);
    }

    async processMessage(message) {
        try {
            message.attempts++;
            message.lastAttempt = new Date();

            // Aquí iría la lógica específica de procesamiento según el tipo de mensaje
            switch (message.type) {
                case 'text':
                    await this.processTextMessage(message);
                    break;
                case 'audio':
                    await this.processAudioMessage(message);
                    break;
                case 'document':
                    await this.processDocumentMessage(message);
                    break;
            }

            message.processed = true;
            message.error = null;
            return true;
        } catch (error) {
            message.error = error.message;
            logError('Error procesando mensaje', {
                messageId: message.id,
                attempt: message.attempts,
                error: error.message
            });
            return false;
        }
    }

    async processTextMessage(message) {
        try {
            // Procesar mensaje de texto con servicios externos si es necesario
            await sendMessageToChatbase({
                message: message.content,
                userId: this.whatsappId,
                timestamp: message.timestamp
            });

            return true;
        } catch (error) {
            throw new Error(`Error procesando mensaje de texto: ${error.message}`);
        }
    }

    async processAudioMessage(message) {
        try {
            const transcription = await transcribeAudio(message.content);
            this.metadata.audioTranscriptions.push({
                messageId: message.id,
                transcription,
                timestamp: new Date()
            });
            return true;
        } catch (error) {
            throw new Error(`Error procesando mensaje de audio: ${error.message}`);
        }
    }

    async processDocumentMessage(message) {
        try {
            // Implementar lógica de procesamiento de documentos
            logInfo('Procesando documento', {
                messageId: message.id,
                documentId: message.content
            });
            return true;
        } catch (error) {
            throw new Error(`Error procesando documento: ${error.message}`);
        }
    }

    async processUnprocessedMessages() {
        const results = [];
        for (const message of this.messages) {
            if (!message.processed) {
                const success = await this.processMessage(message);
                results.push({ messageId: message.id, success });
            }
        }
        return results;
    }

    getLastMessage() {
        return this.messages[this.messages.length - 1] || null;
    }

    updateMetadata(data) {
        this.metadata = { ...this.metadata, ...data };
        this.lastUpdateTime = new Date();
        
        logInfo('Metadata actualizada', {
            whatsappId: this.whatsappId,
            updates: Object.keys(data),
            timestamp: this.lastUpdateTime
        });
    }

    markAsRead() {
        this.metadata.hasUnreadMessages = false;
        this.lastUpdateTime = new Date();
        
        logInfo('Conversación marcada como leída', { 
            whatsappId: this.whatsappId,
            timestamp: this.lastUpdateTime
        });
    }

    updateHeartbeat() {
        this.metadata.lastHeartbeat = new Date();
        this.metadata.reconnectAttempts = 0;
        
        logDebug('Heartbeat actualizado', {
            whatsappId: this.whatsappId,
            timestamp: this.metadata.lastHeartbeat
        });
    }

    toJSON() {
        return {
            whatsappId: this.whatsappId,
            userPhoneNumber: this.userPhoneNumber,
            messages: this.messages,
            startTime: this.startTime,
            lastUpdateTime: this.lastUpdateTime,
            status: this.status,
            metadata: this.metadata,
            duration: Date.now() - this.startTime,
            messageCount: this.messages.length,
            hasUnprocessedMessages: this.hasUnprocessedMessages
        };
    }
}

class ConversationService extends EventEmitter {
    constructor() {
        super();
        this.activeConversations = new Map();
        this.conversationTimeout = 30 * 60 * 1000; // 30 minutos
        this.heartbeatInterval = 45000; // 45 segundos
        this.maxReconnectAttempts = 5;
        this.maxRetryAttempts = 3;
        
        this.setupEventHandlers();
        this.startMaintenanceInterval();
        
        logInfo('Servicio de conversaciones iniciado', {
            timeoutMinutes: this.conversationTimeout / 60000,
            heartbeatSeconds: this.heartbeatInterval / 1000,
            maxRetryAttempts: this.maxRetryAttempts
        });
    }

    setupEventHandlers() {
        this.on('messageReceived', this.handleMessageReceived.bind(this));
        this.on('conversationUpdated', this.handleConversationUpdated.bind(this));
        this.on('conversationClosed', this.handleConversationClosed.bind(this));
        this.on('error', this.handleError.bind(this));
    }

    async handleMessageReceived({ conversationId, message }) {
        const conversation = this.getConversation(conversationId);
        if (conversation) {
            this.emit('broadcast', {
                type: 'newMessage',
                data: {
                    conversationId,
                    message,
                    conversation: conversation.toJSON()
                }
            });
        }
    }

    handleConversationUpdated(conversation) {
        this.emit('broadcast', {
            type: 'conversationUpdate',
            data: conversation.toJSON()
        });
    }

    handleConversationClosed(data) {
        this.emit('broadcast', {
            type: 'conversationClosed',
            data
        });
    }

    handleError(error) {
        logError('Error en el servicio de conversaciones', {
            error: error.message,
            stack: error.stack
        });
    }

    async retryProcessMessage(message, attempt = 1) {
        try {
            logInfo('Intentando procesar mensaje', {
                messageId: message.id,
                attempt,
                maxAttempts: this.maxRetryAttempts
            });

            const result = await this.processIncomingMessage(message);
            
            logInfo('Mensaje procesado exitosamente en retry', {
                messageId: message.id,
                attempt
            });

            return result;
        } catch (error) {
            if (attempt < this.maxRetryAttempts) {
                const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
                logInfo('Reintentando procesar mensaje después de delay', {
                    messageId: message.id,
                    attempt,
                    delay
                });

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.retryProcessMessage(message, attempt + 1);
            }

            logError('Máximo número de reintentos alcanzado', {
                messageId: message.id,
                attempts: attempt,
                error: error.message
            });
            throw error;
        }
    }

    startMaintenanceInterval() {
        setInterval(() => this.cleanupInactiveConversations(), 5 * 60 * 1000);
        setInterval(() => this.checkHeartbeats(), this.heartbeatInterval);
    }

    checkHeartbeats() {
        const now = Date.now();
        for (const conversation of this.activeConversations.values()) {
            const timeSinceLastHeartbeat = now - conversation.metadata.lastHeartbeat;
            if (timeSinceLastHeartbeat > this.heartbeatInterval) {
                this.handleMissedHeartbeat(conversation);
            }
        }
    }

    handleMissedHeartbeat(conversation) {
        conversation.metadata.reconnectAttempts++;
        if (conversation.metadata.reconnectAttempts > this.maxReconnectAttempts) {
            this.closeConversation(conversation.whatsappId);
        } else {
            this.emit('reconnectNeeded', {
                conversationId: conversation.whatsappId,
                attempts: conversation.metadata.reconnectAttempts
            });
        }
    }

    createConversation(whatsappId, userPhoneNumber) {
        if (!whatsappId || !userPhoneNumber) {
            logError('Datos inválidos para crear conversación', { whatsappId, userPhoneNumber });
            throw new Error('WhatsApp ID y número de teléfono son requeridos');
        }

        const conversation = new Conversation(whatsappId, userPhoneNumber);
        this.activeConversations.set(whatsappId, conversation);
        
        logInfo('Nueva conversación creada', { 
            whatsappId, 
            userPhoneNumber,
            timestamp: conversation.startTime 
        });

        this.emit('conversationCreated', conversation.toJSON());
        this.emit('broadcast', {
            type: 'newConversation',
            data: conversation.toJSON()
        });
        
        return conversation;
    }

    getConversation(whatsappId) {
        const conversation = this.activeConversations.get(whatsappId);
        if (!conversation) {
            logDebug('Conversación no encontrada', { whatsappId });
        }
        return conversation;
    }

    async processIncomingMessage(message) {
        try {
            if (!validateWhatsAppMessage(message)) {
                throw new Error('Estructura de mensaje de WhatsApp inválida');
            }

            logDebug('Procesando mensaje entrante', {
                from: message.from,
                type: message.type,
                messageId: message.id,
                timestamp: new Date().toISOString()
            });

            const whatsappId = message.from;
            let conversation = this.getConversation(whatsappId);

            if (!conversation) {
                conversation = this.createConversation(whatsappId, message.from);
            }

            const formattedMessage = {
                id: message.id,
                type: message.type,
                direction: 'inbound',
                timestamp: new Date(parseInt(message.timestamp) * 1000),
                status: 'received',
                text: message.type === 'text' ? message.text.body : null,
                audio: message.type === 'audio' ? message.audio.id : null,
                document: message.type === 'document' ? message.document.id : null
            };

            const success = conversation.addMessage(formattedMessage);
            
            if (success) {
                await this.handleSuccessfulMessage(conversation, formattedMessage);
            }

            return conversation;
        } catch (error) {
            logError('Error procesando mensaje entrante', {
                error: error.message,
                messageId: message?.id,
                type: message?.type,
                stack: error.stack
            });
            throw error;
        }
    }

    async handleSuccessfulMessage(conversation, message) {
        try {
            // Actualizar metadata
            conversation.updateMetadata({
                lastProcessedMessageId: message.id,
                lastActivity: new Date(),
                hasUnreadMessages: true
            });

            // Procesar mensaje según tipo
            if (message.type === 'audio') {
                const transcription = await this.handleAudioMessage(message);
                if (transcription) {
                    conversation.metadata.audioTranscriptions.push({
                        messageId: message.id,
                        transcription,
                        timestamp: new Date()
                    });
                }
            }

            // Emitir eventos
            this.emit('messageReceived', {
                conversationId: conversation.whatsappId,
                message
            });

            this.emit('conversationUpdated', conversation);

            // Broadcast para UI
            this.emit('broadcast', {
                type: 'newMessage',
                data: {
                    conversationId: conversation.whatsappId,
                    message,
                    conversation: conversation.toJSON()
                }
            });

        } catch (error) {
            logError('Error en handleSuccessfulMessage', {
                error: error.message,
                conversationId: conversation.whatsappId,
                messageId: message.id
            });
        }
    }

    async handleAudioMessage(message) {
        try {
            if (!message.audio?.id) return null;
            const transcription = await transcribeAudio(message.audio.id);
            return transcription;
        } catch (error) {
            logError('Error al transcribir audio', {
                error: error.message,
                messageId: message.id,
                audioId: message.audio.id
            });
            return null;
        }
    }

    async cleanupInactiveConversations() {
        const now = Date.now();
        const inactiveConversations = [];

        for (const [whatsappId, conversation] of this.activeConversations) {
            const timeSinceLastUpdate = now - conversation.lastUpdateTime;
            if (timeSinceLastUpdate > this.conversationTimeout) {
                inactiveConversations.push(whatsappId);
            }
        }

        for (const whatsappId of inactiveConversations) {
            await this.closeConversation(whatsappId);
        }

        logInfo('Limpieza de conversaciones completada', {
            inactiveCount: inactiveConversations.length,
            remainingCount: this.activeConversations.size,
            timestamp: new Date()
        });

        this.emit('broadcast', {
            type: 'conversationsStatus',
            data: {
                activeCount: this.activeConversations.size,
                conversations: Array.from(this.activeConversations.values()).map(c => c.toJSON())
            }
        });
    }

    async closeConversation(whatsappId) {
        const conversation = this.getConversation(whatsappId);
        if (!conversation) {
            logDebug('Intento de cerrar conversación inexistente', { whatsappId });
            return;
        }

        try {
            // Procesar mensajes pendientes antes de cerrar
            if (conversation.hasUnprocessedMessages) {
                await conversation.processUnprocessedMessages();
            }

            conversation.status = 'closed';
            this.activeConversations.delete(whatsappId);
            
            logInfo('Conversación cerrada', {
                whatsappId,
                duration: Date.now() - conversation.startTime,
                messageCount: conversation.messages.length,
                timestamp: new Date()
            });

            this.emit('conversationClosed', {
                whatsappId,
                summary: conversation.toJSON()
            });

            // Broadcast final del cierre
            this.emit('broadcast', {
                type: 'conversationClosed',
                data: {
                    whatsappId,
                    timestamp: new Date(),
                    summary: conversation.toJSON()
                }
            });
        } catch (error) {
            logError('Error al cerrar conversación', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
        }
    }

    async getConversationAnalytics() {
        try {
            const analytics = {
                activeConversations: this.activeConversations.size,
                conversations: Array.from(this.activeConversations.values()).map(conv => ({
                    whatsappId: conv.whatsappId,
                    messageCount: conv.messages.length,
                    duration: Date.now() - conv.startTime,
                    status: conv.status,
                    lastActivity: conv.metadata.lastActivity,
                    hasUnreadMessages: conv.metadata.hasUnreadMessages,
                    audioTranscriptionsCount: conv.metadata.audioTranscriptions.length,
                    processingErrors: conv.metadata.processingErrors.length,
                    unprocessedMessages: conv.messages.filter(m => !m.processed).length
                }))
            };

            // Calcular estadísticas adicionales
            const totalMessages = analytics.conversations.reduce((sum, conv) => sum + conv.messageCount, 0);
            analytics.averageMessagesPerConversation = totalMessages / analytics.activeConversations || 0;

            logInfo('Analytics generados', {
                totalConversations: analytics.activeConversations,
                totalMessages,
                timestamp: new Date()
            });

            this.emit('analyticsGenerated', analytics);
            this.emit('broadcast', {
                type: 'analytics',
                data: analytics
            });

            return analytics;
        } catch (error) {
            logError('Error generando analytics', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    getAllConversations() {
        return Array.from(this.activeConversations.values()).map(conv => conv.toJSON());
    }

    updateConversationHeartbeat(whatsappId) {
        const conversation = this.getConversation(whatsappId);
        if (conversation) {
            conversation.updateHeartbeat();
            this.emit('heartbeat', {
                conversationId: whatsappId,
                timestamp: conversation.metadata.lastHeartbeat
            });

            logDebug('Heartbeat actualizado', {
                whatsappId,
                timestamp: conversation.metadata.lastHeartbeat
            });
        }
    }

    getActiveConversationCount() {
        return this.activeConversations.size;
    }

    getConversationState(whatsappId) {
        const conversation = this.getConversation(whatsappId);
        if (!conversation) return null;

        return {
            isActive: conversation.isActive,
            hasUnprocessedMessages: conversation.hasUnprocessedMessages,
            lastMessageTimestamp: conversation.getLastMessage()?.timestamp,
            messageCount: conversation.messages.length,
            status: conversation.status,
            metadata: conversation.metadata
        };
    }
}

// Exportar una única instancia del servicio
const conversationService = new ConversationService();
module.exports = conversationService;