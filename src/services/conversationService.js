const { transcribeAudio, synthesizeText } = require('../integrations/googleSTT');
const { sendMessageToChatbase } = require('../integrations/chatbaseClient');
const { logInfo, logError } = require('../utils/logger');
const EventEmitter = require('events');

function validateMessage(message) {
    const requiredFields = ['id', 'type', 'direction', 'timestamp'];
    const missingFields = requiredFields.filter(field => !message[field]);
    
    if (missingFields.length > 0) {
        logError('Mensaje inválido - campos faltantes', {
            missingFields,
            messageId: message.id
        });
        return false;
    }
    if (message.type === 'text' && !message.text) {
        logError('Mensaje de texto sin contenido', { messageId: message.id });
        return false;
    }
    if (message.type === 'audio' && !message.audio) {
        logError('Mensaje de audio sin contenido', { messageId: message.id });
        return false;
    }
    return true;
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
            lastHeartbeat: new Date()
        };
    }

    addMessage(message) {
        if (!validateMessage(message)) {
            logError('Intento de añadir mensaje inválido', { message });
            return false;
        }

        const formattedMessage = {
            id: message.id,
            timestamp: message.timestamp,
            type: message.type,
            direction: message.direction,
            content: message.text || message.audio || '',
            status: message.status || 'received',
            processed: false,
            attempts: 0,
            lastAttempt: null
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
        this.heartbeatInterval = 45000; // 45 segundos
        this.maxReconnectAttempts = 5;
        
        this.setupEventHandlers();
        this.startMaintenanceInterval();
        
        logInfo('Servicio de conversaciones iniciado', {
            timeoutMinutes: this.conversationTimeout / 60000,
            heartbeatSeconds: this.heartbeatInterval / 1000
        });
    }

    setupEventHandlers() {
        this.on('messageReceived', this.handleMessageReceived.bind(this));
        this.on('conversationUpdated', this.handleConversationUpdated.bind(this));
        this.on('conversationClosed', this.handleConversationClosed.bind(this));
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
            logInfo('Conversación no encontrada', { whatsappId });
        }
        return conversation;
    }

    async processIncomingMessage(message) {
        try {
            if (!validateMessage(message)) {
                throw new Error('Mensaje inválido');
            }

            console.log('🔄 Procesando mensaje entrante:', {
                from: message.from,
                type: message.type,
                hasText: !!message.text,
                hasAudio: !!message.audio,
                timestamp: new Date().toISOString()
            });

            const whatsappId = message.from;
            let conversation = this.getConversation(whatsappId);

            if (!conversation) {
                console.log('🆕 Creando nueva conversación para:', whatsappId);
                conversation = this.createConversation(whatsappId, message.from);
            } else {
                console.log('📱 Usando conversación existente:', {
                    id: whatsappId,
                    messageCount: conversation.messages.length
                });
            }

            const formattedMessage = {
                id: message.id,
                type: this.determineMessageType(message),
                direction: 'inbound',
                content: message.text?.body || message.audio?.id,
                status: 'received',
                timestamp: new Date(),
                text: message.text?.body,
                audio: message.audio?.id
            };

            const success = conversation.addMessage(formattedMessage);

            if (success) {
                if (message.profile) {
                    conversation.updateMetadata({ 
                        userProfile: message.profile,
                        lastInteraction: new Date()
                    });
                }

                this.emit('messageReceived', {
                    conversationId: whatsappId,
                    message: conversation.getLastMessage()
                });

                this.emit('conversationUpdated', conversation);
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

    async cleanupInactiveConversations() {
        const now = Date.now();
        for (const [whatsappId, conversation] of this.activeConversations) {
            const timeSinceLastUpdate = now - conversation.lastUpdateTime;
            if (timeSinceLastUpdate > this.conversationTimeout) {
                await this.closeConversation(whatsappId);
            }
        }

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
        if (!conversation) return;

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

        this.emit('analyticsGenerated', analytics);
        this.emit('broadcast', {
            type: 'analytics',
            data: analytics
        });

        return analytics;
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
        }
    }
}

// Exportar una única instancia del servicio
const conversationService = new ConversationService();
module.exports = conversationService;