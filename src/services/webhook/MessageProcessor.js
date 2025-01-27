// src/services/webhook/MessageProcessor.js
const { logInfo, logError } = require('../../utils/logger');
const queryClassifierService = require('../queryClassifierService');
const chatbaseController = require('../../controllers/chatbaseController');

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        this.documentRequestKey = "juli quiero el documento";
    }

    async processMessage(message, context) {
        try {
            const conversation = await this.conversationService.getConversation(message.from);
            
            // Solo procesar mensajes de texto
            if (message.type !== 'text') {
                return await this._processNormalMessage(message, conversation, context);
            }

            const originalMessage = message.text.body;
            const normalizedMessage = originalMessage.toLowerCase().trim();

            logInfo('Message processing started', {
                originalMessage,
                normalizedMessage,
                messageType: message.type,
                awaitingEmail: conversation?.metadata?.awaitingEmail,
                category: conversation?.category
            });

            // Verificar si es un comando de documento
            if (normalizedMessage === this.documentRequestKey) {
                logInfo('Document request trigger detected', {
                    category: conversation?.category
                });
                return await this._handleDocumentRequest(message, conversation);
            }

            // Verificar si estamos esperando un email
            if (conversation?.metadata?.awaitingEmail) {
                logInfo('Email submission detected', {
                    email: normalizedMessage
                });
                return await this._handleEmailSubmission(message, conversation, context);
            }

            // Procesar como mensaje normal
            return await this._processNormalMessage(message, conversation, context);

        } catch (error) {
            logError('Message processing error', { error });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _handleDocumentRequest(message, conversation) {
        try {
            logInfo('Processing document request', {
                whatsappId: conversation.whatsappId,
                category: conversation?.category
            });

            // Verificar si tenemos una categoría válida
            if (!conversation?.category || conversation.category === 'unknown') {
                await this.whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "Por favor, cuéntame primero tu caso para poder ayudarte con el documento adecuado."
                );
                return { success: true, messageProcessed: true };
            }

            // Actualizar estado de la conversación
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    awaitingEmail: true,
                    emailRequestTimestamp: new Date().toISOString(),
                    documentRequestPending: true
                }
            );

            // Solicitar correo electrónico
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
            );

            return { success: true, messageProcessed: true };
        } catch (error) {
            logError('Error handling document request', { error });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _handleEmailSubmission(message, conversation, context) {
        const email = message.text.body.trim();
        
        if (!this._isValidEmail(email)) {
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "El correo electrónico no es válido. Por favor, ingresa un correo válido."
            );
            return { success: true, messageProcessed: true };
        }

        try {
            logInfo('Starting document generation process', {
                email,
                whatsappId: conversation.whatsappId,
                category: conversation.category
            });

            // Actualizar estado
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    email: email,
                    awaitingEmail: false,
                    processingDocument: true
                }
            );

            // Notificar inicio del proceso
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estamos procesando tu solicitud para generar el documento legal..."
            );

            // Preparar datos del cliente
            const customerData = {
                name: context.contacts?.[0]?.profile?.name || 'Usuario',
                documentNumber: conversation.metadata?.documentNumber,
                email: email,
                phone: message.from,
                address: conversation.metadata?.address || "No especificado",
                ...this._getServiceSpecificData(conversation)
            };

            // Generar quejas y documento
            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            await this.documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );

            // Actualizar estado final
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    processingDocument: false,
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString()
                }
            );

            // Notificar éxito
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return { success: true, messageProcessed: true };
        } catch (error) {
            logError('Error processing document', { error });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _processNormalMessage(message, conversation, context) {
        try {
            if (conversation.shouldClassify()) {
                logInfo('Clasificando consulta', {
                    text: message.text?.body
                });

                const classification = await this._handleCategoryClassification(message, conversation);
                
                if (classification.category !== 'unknown') {
                    await this._handleChatbaseResponse(message, classification.category, conversation);
                }
            } else if (conversation.category && conversation.category !== 'unknown') {
                logInfo('Usando categoría existente', {
                    category: conversation.category
                });
                await this._handleChatbaseResponse(message, conversation.category, conversation);
            }

            const formattedMessage = this.formatMessage(message, context);
            await this.conversationService.processIncomingMessage(formattedMessage);

            if (message.type === 'text' || message.type === 'audio') {
                await this.whatsappService.markAsRead(message.id);
            }

            if (this.wsManager) {
                this.wsManager.broadcastConversationUpdate(conversation);
            }

            return { success: true, messageProcessed: true };
        } catch (error) {
            logError('Error in normal message processing', { error });
            throw error;
        }
    }

    async _handleCategoryClassification(message, conversation) {
        try {
            const classification = await queryClassifierService.classifyQuery(message.text.body);
            logInfo('Resultado de clasificación', classification);

            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    category: classification.category,
                    classificationConfidence: classification.confidence
                }
            );

            if (classification.category !== 'unknown') {
                await this._sendCategoryConfirmation(
                    conversation.whatsappId,
                    classification.category
                );
            }

            return classification;
        } catch (error) {
            logError('Error in category classification', { error });
            throw error;
        }
    }

    async _handleChatbaseResponse(message, category, conversation) {
        try {
            logInfo('Solicitando respuesta a Chatbase', {
                serviceType: category,
                conversationId: conversation.whatsappId
            });

            const response = await chatbaseController[`handle${this._formatCategory(category)}`](
                message.text.body
            );

            if (response && response.text) {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    response.text
                );
            }

            return response;
        } catch (error) {
            logError('Error forwarding to Chatbase', { error });
            return null;
        }
    }

    async _sendCategoryConfirmation(whatsappId, category) {
        const messages = {
            servicios_publicos: '🏠 Te ayudaré con tu consulta sobre servicios públicos.',
            telecomunicaciones: '📱 Te ayudaré con tu consulta sobre telecomunicaciones.',
            transporte_aereo: '✈️ Te ayudaré con tu consulta sobre transporte aéreo.'
        };

        const message = messages[category] || 'Entiendo tu consulta. ¿En qué puedo ayudarte?';
        await this.whatsappService.sendTextMessage(whatsappId, message);
    }

    _formatCategory(category) {
        return category.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    _getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.reservationNumber || "N/A",
                    numero_vuelo: conversation.metadata?.flightNumber || "N/A",
                    fecha_vuelo: conversation.metadata?.flightDate || new Date().toISOString().split('T')[0],
                    ruta: conversation.metadata?.route || "N/A",
                    valor_tiquete: conversation.metadata?.ticketValue || "0"
                };
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.accountNumber || "N/A",
                    tipo_servicio: conversation.metadata?.serviceType || "N/A",
                    periodo_facturacion: conversation.metadata?.billingPeriod || "N/A"
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.lineNumber || "N/A",
                    plan_contratado: conversation.metadata?.plan || "N/A",
                    fecha_contratacion: conversation.metadata?.contractDate || "N/A"
                };
            default:
                return {};
        }
    }

    async _sendErrorMessage(to) {
        try {
            await this.whatsappService.sendTextMessage(
                to,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );
        } catch (error) {
            logError('Error sending error message', { error });
        }
    }

    formatMessage(message, context = {}) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            metadata: {
                ...context.metadata,
                profile: context.contacts?.[0]?.profile
            },
            text: message.type === 'text' ? { body: message.text.body } : undefined
        };
    }
}

module.exports = MessageProcessor;