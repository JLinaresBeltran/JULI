const {
    ConversationManager,
    ConversationProcessor,
    ConversationValidator,
    ConversationEvents
} = require('./conversation');
const { logError, logInfo } = require('../utils/logger');
const whatsappService = require('./whatsappService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');
const legalAgentSystem = require('./legalAgents');
const documentService = require('./documentService');

class ConversationService extends ConversationEvents {
    constructor() {
        super();
        this.manager = new ConversationManager();
        
        // Configuración explícita
        this.config = {
            maintenanceInterval: 30 * 1000,    // 30 segundos para revisar
            timeoutDuration: 60 * 1000,        // 1 minuto para timeout
            documentTriggers: [
                "juli quiero el documento",
                "quiero el documento",
                "necesito el documento",
                "generar documento",
                "genera el documento",
                "documento por favor"
            ]
        };

        this.setupHandlers();
        this.startMaintenanceInterval();
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
        let inactiveCount = 0;
        const conversations = this.manager.getAll();

        logInfo('Iniciando revisión de conversaciones inactivas', {
            currentTime: new Date(now).toISOString(),
            timeoutThreshold: Math.floor(this.config.timeoutDuration / 1000) + ' segundos'
        });

        for (const conversation of conversations) {
            const lastMessageTime = this._getLastMessageTime(conversation);
            const inactiveTime = now - lastMessageTime;
            
            logInfo('Revisando conversación', {
                whatsappId: conversation.whatsappId,
                inactiveTime: Math.floor(inactiveTime / 1000) + ' segundos',
                threshold: Math.floor(this.config.timeoutDuration / 1000) + ' segundos'
            });

            if (inactiveTime > this.config.timeoutDuration) {
                await this.closeConversation(conversation.whatsappId);
                inactiveCount++;
            }
        }

        logInfo('Limpieza de conversaciones completada', {
            timestamp: new Date().toISOString()
        });
    }

    setupHandlers() {
        this.on('messageReceived', this.handleMessageReceived.bind(this));
        this.on('conversationUpdated', this.handleConversationUpdated.bind(this));
        this.on('conversationClosed', this.handleConversationClosed.bind(this));
        this.on('error', this.handleError.bind(this));
    }

    handleMessageReceived({conversationId, message}) {
        logInfo('Mensaje recibido', { conversationId });
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

            // Verificar si es una solicitud de documento
            if (message.type === 'text' && this._isDocumentRequest(message.text.body)) {
                return await this._handleDocumentRequest(message, conversation);
            }
    
            // Procesar mensaje de texto normal
            if (message.type === 'text' && message.text?.body) {
                if (!options.skipClassification && conversation.shouldClassify()) {
                    await this._processClassification(message, conversation);
                } else if (conversation.category && conversation.category !== 'unknown') {
                    await this._processChatbaseResponse(message, conversation);
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

    async _processClassification(message, conversation) {
        try {
            logInfo('Clasificando consulta', {
                text: message.text.body
            });

            const classification = await queryClassifierService.classifyQuery(message.text.body);
            
            logInfo('Resultado de clasificación', classification);

            await this.updateCategory(
                conversation.whatsappId,
                classification.category,
                classification.confidence
            );

            if (classification.category !== 'unknown') {
                await this._processChatbaseResponse(message, conversation);
            }

        } catch (error) {
            logError('Error en clasificación', {
                error: error.message,
                messageId: message.id
            });
            throw error;
        }
    }

    async _handleDocumentRequest(message, conversation) {
        try {
            logInfo('Starting document request handler', {
                whatsappId: message.from,
                category: conversation.category || conversation.metadata?.category
            });

            // Verificar si tenemos una categoría válida
            const category = await this._validateAndGetCategory(conversation, message);
            if (!category) {
                await whatsappService.sendTextMessage(
                    message.from,
                    "Para generar el documento de reclamación, necesito que primero me cuentes tu caso en detalle."
                );
                return conversation;
            }

            // Verificar y solicitar correo si es necesario
            if (conversation.metadata?.awaitingEmail) {
                const email = message.text.body.trim();
                if (this._isValidEmail(email)) {
                    return await this._processDocumentGeneration(conversation, email);
                } else {
                    await whatsappService.sendTextMessage(
                        message.from,
                        "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                    );
                    return conversation;
                }
            }

            if (!conversation.metadata?.email) {
                await this.updateConversationMetadata(conversation.whatsappId, {
                    awaitingEmail: true,
                    documentRequestPending: true
                });

                await whatsappService.sendTextMessage(
                    message.from,
                    "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
                );
                return conversation;
            }

            return await this._processDocumentGeneration(conversation);

        } catch (error) {
            logError('Error en solicitud de documento', {
                error: error.message,
                whatsappId: message.from
            });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _processDocumentGeneration(conversation, email = null) {
        try {
            const category = conversation.category || conversation.metadata?.category;
            const customerData = this._prepareCustomerData(conversation, email);

            const result = await legalAgentSystem.processComplaint(
                category,
                conversation.getMessages(),
                customerData
            );

            await documentService.generateDocument(
                category,
                result,
                customerData
            );

            await this.updateConversationMetadata(conversation.whatsappId, {
                documentGenerated: true,
                documentGeneratedTimestamp: new Date().toISOString(),
                email: email || conversation.metadata?.email,
                awaitingEmail: false,
                documentRequestPending: false
            });

            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return conversation;

        } catch (error) {
            logError('Error generando documento', {
                error: error.message,
                whatsappId: conversation.whatsappId
            });
            throw error;
        }
    }

    async _validateAndGetCategory(conversation, message) {
        const currentCategory = conversation.category || conversation.metadata?.category;
        
        if (currentCategory && currentCategory !== 'unknown') {
            return currentCategory;
        }

        // Intentar reclasificar usando el último mensaje no relacionado con documentos
        const messages = conversation.getMessages();
        const lastContentMessage = messages
            .reverse()
            .find(msg => msg.type === 'text' && !this._isDocumentRequest(msg.text?.body));

        if (lastContentMessage) {
            const classification = await queryClassifierService.classifyQuery(lastContentMessage.text.body);
            if (classification.category !== 'unknown') {
                await this.updateCategory(
                    conversation.whatsappId,
                    classification.category,
                    classification.confidence
                );
                return classification.category;
            }
        }

        return null;
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    async _sendErrorMessage(whatsappId) {
        try {
            await whatsappService.sendTextMessage(
                whatsappId,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );
        } catch (error) {
            logError('Error sending error message', { error });
        }
    }

    async _processChatbaseResponse(message, conversation) {
        try {
            const handlers = {
                servicios_publicos: chatbaseController.handleServiciosPublicos,
                telecomunicaciones: chatbaseController.handleTelecomunicaciones,
                transporte_aereo: chatbaseController.handleTransporteAereo
            };

            const handler = handlers[conversation.category];
            if (handler) {
                const response = await handler(message.text.body);
                if (response?.text) {
                    await whatsappService.sendTextMessage(
                        message.from,
                        response.text
                    );
                }
            }
        } catch (error) {
            logError('Error processing Chatbase response', {
                error: error.message,
                category: conversation.category,
                messageId: message.id
            });
        }
    }

    _isDocumentRequest(text) {
        if (!text) return false;
        const normalizedText = text.toLowerCase().trim();
        return this.config.documentTriggers.some(trigger => 
            normalizedText.includes(trigger.toLowerCase())
        );
    }

    _prepareCustomerData(conversation, email = null) {
        return {
            name: conversation.metadata?.customerName || 'Usuario',
            documentNumber: conversation.metadata?.documentNumber,
            email: email || conversation.metadata?.email,
            phone: conversation.whatsappId,
            address: conversation.metadata?.address || 'No especificado',
            ...this._getServiceSpecificData(conversation)
        };
    }

    _getServiceSpecificData(conversation) {
        const metadata = conversation.metadata || {};
        const category = conversation.category || metadata.category;

        const dataMap = {
            'servicios_publicos': {
                cuenta_contrato: metadata.accountNumber,
                tipo_servicio: metadata.serviceType,
                periodo_facturacion: metadata.billingPeriod
            },
            'telecomunicaciones': {
                numero_linea: metadata.lineNumber,
                plan_contratado: metadata.plan,
                fecha_contratacion: metadata.contractDate
            },
            'transporte_aereo': {
                numero_reserva: metadata.reservationNumber,
                numero_vuelo: metadata.flightNumber,
                fecha_vuelo: metadata.flightDate,
                ruta: metadata.route,
                valor_tiquete: metadata.ticketValue
            }
        };

        return dataMap[category] || {};
    }

    _getLastMessageTime(conversation) {
        if (!conversation.messages || conversation.messages.length === 0) {
            return conversation.createdAt?.getTime() || Date.now();
        }
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        return new Date(lastMessage.timestamp).getTime();
    }

    async updateCategory(whatsappId, category, confidence = null) {
        try {
            const conversation = this.manager.get(whatsappId);
            if (!conversation) return false;

            // Actualizar tanto la propiedad directa como los metadatos
            conversation.category = category;
            await this.updateConversationMetadata(whatsappId, {
                category: category,
                classificationConfidence: confidence,
                lastCategoryUpdate: new Date().toISOString()
            });

            logInfo('Category updated successfully', {
                whatsappId,
                category,
                confidence
            });

            return true;
        } catch (error) {
            logError('Error updating category', {
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
                // Reiniciar chat en Chatbase si hay una categoría activa
                if (conversation.category && conversation.category !== 'unknown') {
                    try {
                        const chatbaseClient = require('../integrations/chatbaseClient');
                        await chatbaseClient.resetChat(conversation.category);
                        
                        logInfo('Chat de Chatbase reiniciado', {
                            whatsappId: conversation.whatsappId,
                            category: conversation.category
                        });
                    } catch (error) {
                        logError('Error reiniciando chat en Chatbase', {
                            error: error.message,
                            whatsappId: conversation.whatsappId
                        });
                    }
                }

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
                categoriesDistribution: {},
                documentGenerationStats: {
                    total: 0,
                    successful: 0,
                    pending: 0,
                    failed: 0
                }
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

                // Distribución de categorías
                if (conversation.category) {
                    analytics.categoriesDistribution[conversation.category] = 
                        (analytics.categoriesDistribution[conversation.category] || 0) + 1;
                }

                // Estadísticas de generación de documentos
                if (conversation.metadata?.documentRequestPending) {
                    analytics.documentGenerationStats.pending++;
                }
                if (conversation.metadata?.documentGenerated) {
                    analytics.documentGenerationStats.successful++;
                }
                if (conversation.metadata?.documentGenerationFailed) {
                    analytics.documentGenerationStats.failed++;
                }
                analytics.documentGenerationStats.total = 
                    analytics.documentGenerationStats.successful + 
                    analytics.documentGenerationStats.pending + 
                    analytics.documentGenerationStats.failed;
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