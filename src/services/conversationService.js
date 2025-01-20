const {
    ConversationManager,
    ConversationProcessor,
    ConversationValidator,
    ConversationEvents
} = require('./conversation');
const { logError, logInfo } = require('../utils/logger');
const whatsappService = require('./whatsappService');

class ConversationService extends ConversationEvents {
    constructor() {
        super();
        this.manager = new ConversationManager();
        this.setupHandlers();
        this.startMaintenanceInterval();
        
        // Configuración
        this.config = {
        maintenanceInterval: 30 * 1000,    // 30 segundos para revisar más frecuentemente
        timeoutDuration: 60 * 1000         // 1 minuto para timeout
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
            const isNewConversation = !conversation;
            
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
    
            // Procesar mensaje de texto
            if (message.type === 'text' && message.text?.body) {
                // Solo procesar clasificación si no es el primer mensaje
                if (!options.skipClassification && conversation.isAwaitingClassification()) {
                    try {
                        const queryClassifierService = require('./queryClassifierService');
                        const chatbaseController = require('../controllers/chatbaseController');
                        
                        logInfo('Clasificando consulta', {
                            text: message.text.body
                        });
    
                        // Clasificar el mensaje
                        const classification = queryClassifierService.classifyQuery(message.text.body);
                        
                        logInfo('Resultado de clasificación', {
                            category: classification.category,
                            confidence: classification.confidence,
                            scores: classification.scores
                        });
    
                        // Actualizar metadata
                        await this.updateConversationMetadata(conversation.whatsappId, {
                            category: classification.category,
                            classificationConfidence: classification.confidence
                        });
    
                        // Procesar con Chatbase según la categoría
                        const handlers = {
                            servicios_publicos: chatbaseController.handleServiciosPublicos,
                            telecomunicaciones: chatbaseController.handleTelecomunicaciones,
                            transporte_aereo: chatbaseController.handleTransporteAereo
                        };
    
                        const handler = handlers[classification.category];
                        if (handler) {
                            const chatbaseResponse = await handler(message.text.body);
                            if (chatbaseResponse && chatbaseResponse.text) {
                                await whatsappService.sendTextMessage(
                                    message.from,
                                    chatbaseResponse.text
                                );
    
                                logInfo('Respuesta de Chatbase enviada', {
                                    category: classification.category,
                                    messageId: message.id,
                                    responsePreview: chatbaseResponse.text.substring(0, 100)
                                });
                            }
                        }
                    } catch (error) {
                        logError('Error en clasificación o procesamiento', {
                            error: error.message,
                            messageId: message.id,
                            stack: error.stack
                        });
                    }
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
                messageId: message?.id,
                stack: error.stack
            });
            throw error;
        }
    }

    async createConversation(whatsappId, userPhoneNumber) {
        try {
            if (this.manager.get(whatsappId)) {
                return this.manager.get(whatsappId);
            }
            
            const conversation = this.manager.create(whatsappId, userPhoneNumber);
            
            logInfo('Nueva conversación creada', {
                whatsappId,
                userPhoneNumber,
                context: 'createConversation'
            });

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
                const conversationData = conversation.toJSON();
                this.manager.delete(whatsappId);
                
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
                
                logInfo('Metadata updated successfully', {
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
            
            const analytics = {
                totalConversations: conversations.length,
                activeLastHour: 0,
                averageMessagesPerConversation: 0,
                messageTypes: {},
                totalMessages: 0,
                categoriesDistribution: {}
            };

            for (const conversation of conversations) {
                if (now - conversation.lastUpdateTime <= 3600000) {
                    analytics.activeLastHour++;
                }

                const messages = conversation.getMessages();
                analytics.totalMessages += messages.length;

                messages.forEach(msg => {
                    analytics.messageTypes[msg.type] = (analytics.messageTypes[msg.type] || 0) + 1;
                });

                // Añadir distribución de categorías
                if (conversation.category) {
                    analytics.categoriesDistribution[conversation.category] = 
                        (analytics.categoriesDistribution[conversation.category] || 0) + 1;
                }
            }

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