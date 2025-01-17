const {
    ConversationManager,
    ConversationProcessor,
    ConversationValidator,
    ConversationEvents
} = require('./conversation');
const { logError, logInfo } = require('../utils/logger');
const queryClassifierService = require('./queryClassifierService');
const whatsappService = require('./whatsappService');

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

    async processIncomingMessage(message, options = {}) {
        try {
            if (!ConversationValidator.validateMessage(message)) {
                throw new Error('Mensaje inválido');
            }

            let conversation = this.manager.get(message.from);
            
            // Solo crear una nueva conversación si se especifica o si ya existe
            if (!conversation && options.createIfNotExists) {
                conversation = this.manager.create(message.from, message.from);
                logInfo('Nueva conversación creada', {
                    whatsappId: message.from,
                    context: 'processIncomingMessage'
                });
            }

            if (!conversation) {
                throw new Error('No existe una conversación activa');
            }

            // Verificar si necesitamos clasificar el mensaje
            if (conversation.isAwaitingClassification() && message.type === 'text') {
                await this._handleMessageClassification(conversation, message);
            }

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
                messageId: message?.id,
                stack: error.stack
            });
            throw error;
        }
    }

    async _handleMessageClassification(conversation, message) {
        try {
            logInfo('Clasificando mensaje', {
                whatsappId: conversation.whatsappId,
                messageId: message.id
            });

            const classification = queryClassifierService.classifyQuery(message.text.body);
            
            // Actualizar la conversación con la categoría
            await this.updateConversationMetadata(conversation.whatsappId, {
                category: classification.category,
                classificationConfidence: classification.confidence
            });

            // Enviar mensaje de confirmación
            await this._sendCategoryConfirmation(conversation.whatsappId, classification.category);

            return classification;
        } catch (error) {
            logError('Error en clasificación de mensaje', {
                error: error.message,
                whatsappId: conversation.whatsappId,
                messageId: message.id
            });
            throw error;
        }
    }

    async _sendCategoryConfirmation(whatsappId, category) {
        const messages = {
            servicios_publicos: '🏠 Te ayudaré con tu consulta sobre servicios públicos.',
            telecomunicaciones: '📱 Te ayudaré con tu consulta sobre telecomunicaciones.',
            transporte_aereo: '✈️ Te ayudaré con tu consulta sobre transporte aéreo.'
        };

        const message = messages[category] || 'Entiendo tu consulta. ¿En qué puedo ayudarte?';
        
        await whatsappService.sendTextMessage(whatsappId, message);
        
        logInfo('Mensaje de confirmación enviado', {
            whatsappId,
            category
        });
    }

    async createConversation(whatsappId, userPhoneNumber) {
        try {
            // Verificar si ya existe la conversación
            if (this.manager.get(whatsappId)) {
                return this.manager.get(whatsappId);
            }
            
            // Crear nueva conversación
            const conversation = this.manager.create(whatsappId, userPhoneNumber);
            
            logInfo('Nueva conversación creada', {
                whatsappId,
                userPhoneNumber,
                context: 'createConversation'
            });

            // Emitir evento de conversación creada
            this.emit('conversationCreated', conversation);
            
            return conversation;
        } catch (error) {
            logError('Error creando conversación', {
                error: error.message,
                whatsappId,
                userPhoneNumber,
                stack: error.stack
            });
            throw error;
        }
    }

    getConversation(whatsappId) {
        try {
            return this.manager.get(whatsappId);
        } catch (error) {
            logError('Error obteniendo conversación', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
            return null;
        }
    }

    getAllConversations() {
        try {
            return this.manager.getAll();
        } catch (error) {
            logError('Error obteniendo todas las conversaciones', {
                error: error.message,
                stack: error.stack
            });
            return [];
        }
    }

    getActiveConversationCount() {
        try {
            return this.manager.getCount();
        } catch (error) {
            logError('Error obteniendo conteo de conversaciones', {
                error: error.message,
                stack: error.stack
            });
            return 0;
        }
    }

    async closeConversation(whatsappId) {
        try {
            const conversation = this.manager.get(whatsappId);
            if (conversation) {
                // Preparar datos para el evento antes de eliminar
                const conversationData = conversation.toJSON();
                
                // Eliminar la conversación
                this.manager.delete(whatsappId);
                
                // Emitir evento con los datos guardados
                this.emit('conversationClosed', { 
                    whatsappId, 
                    conversation: conversationData 
                });
                
                logInfo('Conversación cerrada exitosamente', {
                    whatsappId,
                    timestamp: new Date().toISOString()
                });

                return true;
            }
            return false;
        } catch (error) {
            logError('Error cerrando conversación', {
                error: error.message,
                whatsappId,
                stack: error.stack
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
                
                logInfo('Metadata de conversación actualizada', {
                    whatsappId,
                    category: metadata.category,
                    confidence: metadata.classificationConfidence
                });
                
                return true;
            }
            return false;
        } catch (error) {
            logError('Error actualizando metadata de conversación', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
            return false;
        }
    }

    getConversationAnalytics() {
        try {
            const conversations = this.getAllConversations();
            const now = Date.now();
            
            // Análisis básico de conversaciones
            const analytics = {
                totalConversations: conversations.length,
                activeLastHour: 0,
                averageMessagesPerConversation: 0,
                messageTypes: {},
                totalMessages: 0,
                categoriesDistribution: {}
            };

            // Procesar cada conversación
            for (const conversation of conversations) {
                // Contar conversaciones activas en la última hora
                if (now - conversation.lastUpdateTime <= 3600000) {
                    analytics.activeLastHour++;
                }

                // Analizar mensajes
                const messages = conversation.getMessages();
                analytics.totalMessages += messages.length;

                // Contar tipos de mensajes
                messages.forEach(msg => {
                    analytics.messageTypes[msg.type] = (analytics.messageTypes[msg.type] || 0) + 1;
                });

                // Contar distribución de categorías
                if (conversation.category) {
                    analytics.categoriesDistribution[conversation.category] = 
                        (analytics.categoriesDistribution[conversation.category] || 0) + 1;
                }
            }

            // Calcular promedio de mensajes
            if (analytics.totalConversations > 0) {
                analytics.averageMessagesPerConversation = 
                    analytics.totalMessages / analytics.totalConversations;
            }

            return analytics;

        } catch (error) {
            logError('Error generando analytics de conversaciones', {
                error: error.message,
                stack: error.stack
            });
            return null;
        }
    }
}

module.exports = new ConversationService();