// src/services/messageHandler.js
const { logInfo, logError } = require('../utils/logger');

class MessageHandler {
    constructor(conversationService, whatsappService, chatbaseController, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.chatbaseController = chatbaseController;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        this.DOCUMENT_TRIGGER = "juli quiero el documento";
    }

    async handleMessage(message, context) {
        try {
            // 1. Validación inicial del mensaje
            if (!this._validateMessage(message)) {
                throw new Error('Invalid message format');
            }

            // 2. Obtener o crear conversación
            const conversation = await this._getOrCreateConversation(message, context);
            
            // 3. Determinar el tipo de mensaje y flujo
            const messageType = await this._determineMessageType(message, conversation);
            
            // 4. Procesar según el tipo
            switch(messageType) {
                case 'DOCUMENT_REQUEST':
                    return await this._handleDocumentRequest(message, conversation);
                case 'EMAIL_SUBMISSION':
                    return await this._handleEmailSubmission(message, conversation, context);
                case 'NORMAL':
                    return await this._handleNormalMessage(message, conversation, context);
                default:
                    throw new Error(`Unknown message type: ${messageType}`);
            }
        } catch (error) {
            logError('Error handling message', { error, messageId: message.id });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _determineMessageType(message, conversation) {
        if (message.type !== 'text') return 'NORMAL';
        
        const text = message.text.body.toLowerCase().trim();
        
        // Check for document request first
        if (text === this.DOCUMENT_TRIGGER) {
            return 'DOCUMENT_REQUEST';
        }
        
        // Then check if we're awaiting email
        if (conversation?.metadata?.awaitingEmail === true) {
            return 'EMAIL_SUBMISSION';
        }
        
        // Default to normal message
        return 'NORMAL';
    }

    async _handleDocumentRequest(message, conversation) {
        logInfo('Processing document request', {
            whatsappId: message.from,
            category: conversation?.category
        });

        // Verify we have a valid category
        if (!conversation?.category || conversation.category === 'unknown') {
            await this.whatsappService.sendTextMessage(
                message.from,
                "Por favor, cuéntame primero tu caso para poder ayudarte con el documento adecuado."
            );
            return { success: true, type: 'DOCUMENT_REQUEST_REJECTED' };
        }

        // Update conversation state
        await this.conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                awaitingEmail: true,
                emailRequestTimestamp: new Date().toISOString(),
                documentRequestPending: true,
                lastProcessedMessageId: message.id
            }
        );

        // Request email
        await this.whatsappService.sendTextMessage(
            conversation.whatsappId,
            "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
        );

        return { success: true, type: 'DOCUMENT_REQUEST_ACCEPTED' };
    }

    async _handleEmailSubmission(message, conversation, context) {
        const email = message.text.body.trim();

        if (!this._isValidEmail(email)) {
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "El correo electrónico no es válido. Por favor, ingresa un correo válido."
            );
            return { success: true, type: 'INVALID_EMAIL' };
        }

        try {
            // Update state and notify user
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    email: email,
                    awaitingEmail: false,
                    processingDocument: true,
                    lastProcessedMessageId: message.id
                }
            );

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estamos procesando tu solicitud para generar el documento legal..."
            );

            // Prepare customer data
            const customerData = this._prepareCustomerData(conversation, context, email);

            // Generate and send document
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

            // Update final state and notify success
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    processingDocument: false,
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString()
                }
            );

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return { success: true, type: 'DOCUMENT_GENERATED' };

        } catch (error) {
            logError('Error in email submission handler', { error });
            throw error;
        }
    }

    async _handleNormalMessage(message, conversation, context) {
        // Process message normally - this includes classification and Chatbase
        await this.conversationService.processIncomingMessage(
            this._formatMessage(message, context)
        );

        if (message.type === 'text' || message.type === 'audio') {
            await this.whatsappService.markAsRead(message.id);
        }

        return { success: true, type: 'NORMAL_PROCESSED' };
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    _validateMessage(message) {
        return message && message.id && message.from && message.timestamp;
    }

    async _getOrCreateConversation(message, context) {
        let conversation = await this.conversationService.getConversation(message.from);
        
        if (!conversation) {
            conversation = await this.conversationService.createConversation(
                message.from,
                message.from
            );
        }
        
        return conversation;
    }

    _formatMessage(message, context) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            metadata: context.metadata,
            text: message.type === 'text' ? { body: message.text.body } : undefined
        };
    }

    _prepareCustomerData(conversation, context, email) {
        return {
            name: context.contacts?.[0]?.profile?.name || 'Usuario',
            documentNumber: conversation.metadata?.documentNumber,
            email: email,
            phone: conversation.whatsappId,
            address: conversation.metadata?.address || "No especificado",
            ...this._getServiceSpecificData(conversation)
        };
    }

    _getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.accountNumber,
                    tipo_servicio: conversation.metadata?.serviceType,
                    periodo_facturacion: conversation.metadata?.billingPeriod
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.lineNumber,
                    plan_contratado: conversation.metadata?.plan,
                    fecha_contratacion: conversation.metadata?.contractDate
                };
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.reservationNumber,
                    numero_vuelo: conversation.metadata?.flightNumber,
                    fecha_vuelo: conversation.metadata?.flightDate,
                    ruta: conversation.metadata?.route,
                    valor_tiquete: conversation.metadata?.ticketValue
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
}

module.exports = MessageHandler;