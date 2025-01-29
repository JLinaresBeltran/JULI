const {
    ConversationManager,
    ConversationProcessor,
    ConversationValidator,
    ConversationEvents
} = require('./conversation');
const { logError, logInfo } = require('../utils/logger');
const DocumentRequestHandler = require('./messageHandler');
const queryClassifierService = require('./queryClassifierService');
const chatbaseClient = require('../integrations/chatbaseClient');

class ConversationService extends ConversationEvents {
    constructor() {
        super();
        this.manager = new ConversationManager();
        this.documentHandler = new DocumentRequestHandler();
        
        // Configuración básica
        this.config = {
            maintenanceInterval: 30 * 1000,    // 30 segundos para revisar
            timeoutDuration: 60 * 1000         // 1 minuto para timeout
        };

        this.setupHandlers();
        this.startMaintenanceInterval();
    }

    setupHandlers() {
        this.on('messageReceived', this.handleMessageReceived.bind(this));
        this.on('conversationUpdated', this.handleConversationUpdated.bind(this));
        this.on('conversationClosed', this.handleConversationClosed.bind(this));
        this.on('error', this.handleError.bind(this));
    }

    startMaintenanceInterval() {
        if (this._maintenanceInterval) {
            clearInterval(this._maintenanceInterval);
        }

        this._maintenanceInterval = setInterval(() => {
            this.cleanupInactiveConversations();
        }, this.config.maintenanceInterval);
        
        logInfo('Intervalo de mantenimiento iniciado', {
            checkInterval: Math.floor(this.config.maintenanceInterval / 1000) + ' segundos',
            timeoutDuration: Math.floor(this.config.timeoutDuration / 1000) + ' segundos'
        });
    }

    async cleanupInactiveConversations() {
        const now = Date.now();
        const conversations = this.manager.getAll();

        for (const conversation of conversations) {
            const lastMessageTime = this._getLastMessageTime(conversation);
            const inactiveTime = now - lastMessageTime;
            
            if (inactiveTime > this.config.timeoutDuration) {
                await this.closeConversation(conversation.whatsappId);
            }
        }
    }

    // Event Handlers
    handleMessageReceived({conversationId, message}) {
        logInfo('Mensaje recibido', { conversationId });
    }

    handleConversationUpdated(conversation) {
        logInfo('Conversación actualizada', { whatsappId: conversation.whatsappId });
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

    // Core Conversation Methods
    async processIncomingMessage(message, options = {}) {
        try {
            if (!ConversationValidator.validateMessage(message)) {
                throw new Error('Mensaje inválido');
            }
    
            let conversation = this.manager.get(message.from);
            
            if (!conversation && options.createIfNotExists) {
                conversation = await this.createConversation(message.from, message.from);
            }
    
            if (!conversation) {
                throw new Error('No existe una conversación activa');
            }

            // Verificar si es una solicitud de documento
            if (this.documentHandler.isDocumentRequest(message)) {
                return await this.documentHandler.handleDocumentRequest(message, conversation);
            }
    
            // Procesar mensaje normal
            if (message.type === 'text' && message.text?.body) {
                if (!options.skipClassification && conversation.shouldClassify()) {
                    await this._processClassification(message, conversation);
                }
            }
    
            // Agregar mensaje a la conversación
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

    async _processClassification(message, conversation) {
        try {
            const classification = await queryClassifierService.classifyQuery(message.text.body);
            await this.updateCategory(
                conversation.whatsappId,
                classification.category,
                classification.confidence
            );
        } catch (error) {
            logError('Error en clasificación', {
                error: error.message,
                messageId: message.id
            });
            throw error;
        }
    }

    // Conversation Management Methods
    async createConversation(whatsappId, userPhoneNumber) {
        try {
            if (this.manager.get(whatsappId)) {
                return this.manager.get(whatsappId);
            }
            
            const conversation = this.manager.create(whatsappId, userPhoneNumber);
            this.emit('conversationCreated', conversation);
            return conversation;
        } catch (error) {
            logError('Error creando conversación', {
                error: error.message,
                whatsappId
            });
            throw error;
        }
    }

    async updateCategory(whatsappId, category, confidence = null) {
        try {
            const conversation = this.manager.get(whatsappId);
            if (!conversation) return false;

            conversation.category = category;
            await this.updateConversationMetadata(whatsappId, {
                category,
                classificationConfidence: confidence,
                lastCategoryUpdate: new Date().toISOString()
            });

            return true;
        } catch (error) {
            logError('Error updating category', {
                error: error.message,
                whatsappId
            });
            return false;
        }
    }

    async updateConversationMetadata(whatsappId, metadata) {
        try {
            const conversation = this.manager.get(whatsappId);
            if (conversation) {
                conversation.updateMetadata(metadata);
                this.emit('conversationUpdated', conversation);
                return true;
            }
            return false;
        } catch (error) {
            logError('Error actualizando metadata', {
                error: error.message,
                whatsappId
            });
            return false;
        }
    }

    // Utility Methods
    _getLastMessageTime(conversation) {
        if (!conversation.messages || conversation.messages.length === 0) {
            return conversation.createdAt?.getTime() || Date.now();
        }
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        return new Date(lastMessage.timestamp).getTime();
    }

    // Public API Methods
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
        try {
            const conversation = this.manager.get(whatsappId);
            if (conversation) {
                if (conversation.category && conversation.category !== 'unknown') {
                    await chatbaseClient.resetChat(conversation.category);
                }

                const conversationData = conversation.toJSON();
                this.manager.delete(whatsappId);
                this.emit('conversationClosed', { 
                    whatsappId, 
                    conversation: conversationData 
                });
                return true;
            }
            return false;
        } catch (error) {
            logError('Error cerrando conversación', {
                error: error.message,
                whatsappId
            });
            return false;
        }
    }
}

module.exports = new ConversationService();