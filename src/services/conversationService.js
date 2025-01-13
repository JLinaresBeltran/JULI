const { transcribeAudio, synthesizeText } = require('../integrations/googleSTT');
const { sendMessageToChatbase } = require('../integrations/chatbaseClient');
const { logInfo, logError } = require('../utils/logger');
const EventEmitter = require('events');

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
            hasUnreadMessages: false
        };
    }

    addMessage(message) {
        // Validar mensaje
        if (!message || !message.content) {
            logError('Intento de añadir mensaje inválido', { message });
            return false;
        }

        // Añadir campos adicionales al mensaje
        const enhancedMessage = {
            ...message,
            id: message.id || Date.now().toString(),
            timestamp: message.timestamp || new Date(),
            type: message.type || 'text',
            direction: message.direction,
            content: message.content,
            status: message.status || 'received',
            processed: false
        };

        this.messages.push(enhancedMessage);
        this.lastUpdateTime = new Date();
        this.metadata.messageCount++;
        this.metadata.lastActivity = new Date();
        this.metadata.hasUnreadMessages = true;

        logInfo('Mensaje añadido a la conversación', {
            whatsappId: this.whatsappId,
            messageId: enhancedMessage.id,
            type: enhancedMessage.type,
            direction: enhancedMessage.direction
        });

        return true;
    }

    getLastMessage() {
        return this.messages[this.messages.length - 1];
    }

    updateMetadata(data) {
        this.metadata = { ...this.metadata, ...data };
        logInfo('Metadata actualizada', {
            whatsappId: this.whatsappId,
            updates: Object.keys(data)
        });
    }

    markAsRead() {
        this.metadata.hasUnreadMessages = false;
        logInfo('Conversación marcada como leída', { whatsappId: this.whatsappId });
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
            messageCount: this.messages.length
        };
    }
}

class ConversationService extends EventEmitter {
    constructor() {
        super();
        this.activeConversations = new Map();
        this.conversationTimeout = 30 * 60 * 1000; // 30 minutos
        
        // Iniciar el sistema de limpieza automática
        this.startCleanupInterval();
        
        logInfo('Servicio de conversaciones iniciado', {
            timeoutMinutes: this.conversationTimeout / 60000
        });
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

        // Emitir evento de creación de conversación
        this.emit('conversationCreated', conversation.toJSON());
        
        return conversation;
    }

    getConversation(whatsappId) {
        const conversation = this.activeConversations.get(whatsappId);
        if (!conversation) {
            logInfo('Conversación no encontrada', { whatsappId });
        }
        return conversation;
    }

    async processIncomingMessage(message) {
        try {
            logInfo('Procesando mensaje entrante', {
                from: message.from,
                type: message.type,
                timestamp: new Date()
            });

            const whatsappId = message.from;
            let conversation = this.getConversation(whatsappId);

            if (!conversation) {
                conversation = this.createConversation(whatsappId, message.from);
            }

            const success = conversation.addMessage({
                id: message.id,
                type: this.determineMessageType(message),
                direction: 'inbound',
                content: message.text || message.audio,
                status: 'received',
                timestamp: new Date()
            });

            if (success) {
                if (message.profile) {
                    conversation.updateMetadata({ 
                        userProfile: message.profile,
                        lastInteraction: new Date()
                    });
                }

                // Emitir evento de mensaje recibido
                this.emit('messageReceived', {
                    conversationId: whatsappId,
                    message: conversation.getLastMessage()
                });

                await this.checkConversationTimeout(whatsappId);
            }

            return conversation;
        } catch (error) {
            logError('Error procesando mensaje entrante', error);
            this.emit('error', error);
            throw error;
        }
    }

    determineMessageType(message) {
        if (!message) return 'unknown';
        if (message.type === 'audio') return 'audio';
        if (message.type === 'document') return 'document';
        return 'text';
    }

    startCleanupInterval() {
        setInterval(() => {
            this.cleanupInactiveConversations();
        }, 5 * 60 * 1000); // Revisar cada 5 minutos
    }

    async cleanupInactiveConversations() {
        const now = Date.now();
        for (const [whatsappId, conversation] of this.activeConversations) {
            const timeSinceLastUpdate = now - conversation.lastUpdateTime;
            if (timeSinceLastUpdate > this.conversationTimeout) {
                await this.closeConversation(whatsappId);
            }
        }
    }

    async closeConversation(whatsappId) {
        const conversation = this.getConversation(whatsappId);
        if (!conversation) return;

        conversation.status = 'closed';
        this.activeConversations.delete(whatsappId);
        
        logInfo('Conversación cerrada', {
            whatsappId,
            duration: Date.now() - conversation.startTime,
            messageCount: conversation.messages.length
        });

        // Emitir evento de cierre de conversación
        this.emit('conversationClosed', {
            whatsappId,
            summary: conversation.toJSON()
        });
    }

    async getConversationAnalytics() {
        const analytics = {
            activeConversations: this.activeConversations.size,
            conversations: Array.from(this.activeConversations.values()).map(conv => ({
                whatsappId: conv.whatsappId,
                messageCount: conv.messages.length,
                duration: Date.now() - conv.startTime,
                status: conv.status,
                lastActivity: conv.metadata.lastActivity,
                hasUnreadMessages: conv.metadata.hasUnreadMessages,
                audioTranscriptionsCount: conv.metadata.audioTranscriptions.length
            }))
        };

        logInfo('Analytics generados', {
            totalConversations: analytics.activeConversations,
            timestamp: new Date()
        });

        // Emitir evento de actualización de analytics
        this.emit('analyticsGenerated', analytics);

        return analytics;
    }

    // Método para verificar el timeout de la conversación (añadido para completar el método mencionado)
    async checkConversationTimeout(whatsappId) {
        const conversation = this.getConversation(whatsappId);
        if (!conversation) return;

        const timeSinceLastUpdate = Date.now() - conversation.lastUpdateTime;
        if (timeSinceLastUpdate > this.conversationTimeout) {
            await this.closeConversation(whatsappId);
        }
    }
}

// Exportar una única instancia del servicio
const conversationService = new ConversationService();
module.exports = conversationService;