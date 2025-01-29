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
        
        // Configuración de triggers para documentos
        this.documentTriggers = [
            "juli quiero el documento",
            "generar documento",
            "generar",
            "documento",
            "necesito documento",
            "quiero documento",
            "documento por favor"
        ];

        // Cache para mensajes procesados
        this.processedMessages = new Set();
        // Tiempo de expiración para mensajes en cache (15 minutos)
        this.messageExpirationTime = 15 * 60 * 1000;
    }

    _isDuplicateMessage(messageId) {
        if (!messageId) return false;
        
        // Verificar si el mensaje ya fue procesado
        if (this.processedMessages.has(messageId)) {
            logInfo('Mensaje duplicado detectado', { messageId });
            return true;
        }

        // Agregar mensaje al cache
        this.processedMessages.add(messageId);

        // Programar limpieza del mensaje del cache
        setTimeout(() => {
            this.processedMessages.delete(messageId);
            logInfo('Mensaje eliminado del cache', { messageId });
        }, this.messageExpirationTime);

        return false;
    }

    async processMessage(message, context) {
        try {
            // Verificar duplicados antes de procesar
            if (this._isDuplicateMessage(message.id)) {
                logInfo('Mensaje duplicado ignorado', { 
                    messageId: message.id,
                    from: message.from 
                });
                return { success: true, status: 'DUPLICATE_MESSAGE' };
            }

            logInfo(`Procesando mensaje de ${message.from}:`, message.text?.body);

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

            // Verificar si es un trigger de documento
            if (this._isDocumentRequest(normalizedMessage)) {
                logInfo('Document request trigger detected', {
                    category: conversation?.category
                });
                return await this._handleDocumentRequest(message, conversation, context);
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
            logError('Error procesando mensaje:', error);
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

    _isDocumentRequest(text) {
        if (!text) return false;
        const normalizedText = text.toLowerCase().trim();
        return this.documentTriggers.some(trigger => 
            normalizedText.includes(trigger.toLowerCase())
        );
    }

    async _handleDocumentRequest(message, conversation, context) {
        try {
            logInfo('Processing document request', {
                whatsappId: message.from,
                category: conversation?.category || conversation?.metadata?.category
            });

            // Verificar si tenemos una categoría válida
            if (!conversation.category || conversation.category === 'unknown') {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Para generar el documento de reclamación, necesito que primero me cuentes tu caso en detalle."
                );
                return { success: true, status: 'NEED_MORE_INFO' };
            }

            // Verificar si ya tenemos el email
            if (!conversation.metadata?.email) {
                await this.conversationService.updateConversationMetadata(
                    conversation.whatsappId,
                    {
                        awaitingEmail: true,
                        documentRequestPending: true
                    }
                );

                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Por favor, proporciona tu correo electrónico para enviarte el documento."
                );

                return { success: true, status: 'AWAITING_EMAIL' };
            }

            // Preparar datos del cliente
            const customerData = {
                name: context.contacts?.[0]?.profile?.name || 'Usuario',
                email: conversation.metadata.email,
                phone: message.from,
                address: conversation.metadata?.address || "No especificado",
                documentNumber: conversation.metadata?.documentNumber,
                ...this._getServiceSpecificData(conversation)
            };

            logInfo('Generando documento con datos:', {
                category: conversation.category,
                customerName: customerData.name,
                email: customerData.email
            });

            // Generar documento
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

            // Actualizar estado
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString(),
                    documentRequestPending: false
                }
            );

            // Notificar al usuario
            await this.whatsappService.sendTextMessage(
                message.from,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return {
                success: true,
                status: 'DOCUMENT_GENERATED',
                documentGenerated: true,
                email: customerData.email
            };

        } catch (error) {
            logError('Error procesando solicitud de documento:', error);
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
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    email: email,
                    awaitingEmail: false,
                    processingDocument: true
                }
            );

            return await this._handleDocumentRequest(message, conversation, context);

        } catch (error) {
            logError('Error processing email submission', { error });
            await this._sendErrorMessage(message.from);
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

    _formatCategory(category) {
        return category.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    _getServiceSpecificData(conversation) {
        const metadata = conversation.metadata || {};
        switch(conversation.category) {
            case 'servicios_publicos':
                return {
                    cuenta_contrato: metadata.accountNumber,
                    tipo_servicio: metadata.serviceType,
                    periodo_facturacion: metadata.billingPeriod
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: metadata.lineNumber,
                    plan_contratado: metadata.plan,
                    fecha_contratacion: metadata.contractDate
                };
            case 'transporte_aereo':
                return {
                    numero_reserva: metadata.reservationNumber,
                    numero_vuelo: metadata.flightNumber,
                    fecha_vuelo: metadata.flightDate,
                    ruta: metadata.route,
                    valor_tiquete: metadata.ticketValue
                };
            default:
                return {};
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