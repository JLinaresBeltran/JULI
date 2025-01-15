// src/services/conversationService.js
const {
    ConversationManager,
    ConversationProcessor,
    ConversationValidator,
    ConversationEvents
} = require('./conversation');
const { logError, logInfo } = require('../utils/logger');

class ConversationService extends ConversationEvents {
    constructor() {
        super();
        this.manager = new ConversationManager();
        this.setupHandlers();
        this.startMaintenanceInterval();
        
        // Configuración
        this.config = {
            maintenanceInterval: 5 * 60 * 1000, // 5 minutos
            timeoutDuration: 30 * 60 * 1000     // 30 minutos
        };
    }

    startMaintenanceInterval() {
        setInterval(() => {
            this.cleanupInactiveConversations();
        }, this.config?.maintenanceInterval || 300000);
        
        logInfo('Intervalo de mantenimiento iniciado', {
            interval: this.config?.maintenanceInterval || 300000
        });
    }

    async cleanupInactiveConversations() {
        const now = Date.now();
        let inactiveCount = 0;

        for (const conversation of this.manager.getAll()) {
            if (now - conversation.lastUpdateTime > this.config.timeoutDuration) {
                await this.closeConversation(conversation.whatsappId);
                inactiveCount++;
            }
        }

        if (inactiveCount > 0) {
            logInfo('Limpieza de conversaciones completada', {
                removedCount: inactiveCount,
                remainingCount: this.getActiveConversationCount()
            });
        }
    }

    setupHandlers() {
        this.on('messageReceived', this.handleMessageReceived.bind(this));
        this.on('conversationUpdated', this.handleConversationUpdated.bind(this));
        this.on('conversationClosed', this.handleConversationClosed.bind(this));
        this.on('error', this.handleError.bind(this));
    }

    handleMessageReceived({conversationId, message}) {
        logInfo('Mensaje recibido', { conversationId, messageId: message.id });
    }

    handleConversationUpdated(conversation) {
        logInfo('Conversación actualizada', { 
            whatsappId: conversation.whatsappId 
        });
    }

    handleConversationClosed(data) {
        logInfo('Conversación cerrada', { whatsappId: data.whatsappId });
    }

    handleError(error) {
        logError('Error en el servicio', { 
            message: error.message,
            stack: error.stack 
        });
    }

    async processIncomingMessage(message) {
        try {
            if (!ConversationValidator.validateMessage(message)) {
                throw new Error('Mensaje inválido');
            }

            const conversation = this.manager.get(message.from) || 
                               this.manager.create(message.from, message.from);

            if (conversation.addMessage(message)) {
                await ConversationProcessor.processMessage(message, conversation);
                this.emit('messageReceived', {
                    conversationId: conversation.whatsappId,
                    message
                });
            }

            return conversation;
        } catch (error) {
            logError('Error procesando mensaje entrante', {
                error: error.message,
                messageId: message?.id
            });
            throw error;
        }
    }

    getConversation(whatsappId) {
        return this.manager.get(whatsappId);
    }

    getAllConversations() {
        return this.manager.getAll();
    }

    getActiveConversationCount() {
        return this.manager.getCount();
    }

    async closeConversation(whatsappId) {
        const conversation = this.manager.get(whatsappId);
        if (conversation) {
            this.manager.delete(whatsappId);
            this.emit('conversationClosed', { 
                whatsappId, 
                conversation: conversation.toJSON() 
            });
            return true;
        }
        return false;
    }
}

// Exportar una única instancia del servicio
module.exports = new ConversationService();