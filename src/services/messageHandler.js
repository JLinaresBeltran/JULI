// src/services/messageHandler.js
const { logInfo, logError } = require('../utils/logger');

class MessageHandler {
    constructor(conversationService, whatsappService, chatbaseController, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.chatbaseController = chatbaseController;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        this.DOCUMENT_TRIGGERS = [
            "juli quiero el documento",
            "quiero el documento",
            "necesito el documento",
            "generar documento",
            "genera el documento",
            "documento por favor"
        ];
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
                    return await this._handleDocumentRequest(message, conversation, context);
                case 'NORMAL':
                    return await this._handleNormalMessage(message, conversation, context);
                default:
                    throw new Error(`Unknown message type: ${messageType}`);
            }
        } catch (error) {
            logError('Error handling message', { error: error.message, messageId: message.id });
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    async _determineMessageType(message, conversation) {
        if (message.type !== 'text') return 'NORMAL';
        
        const text = message.text.body.toLowerCase().trim();
        return this.DOCUMENT_TRIGGERS.some(trigger => text.includes(trigger.toLowerCase())) 
            ? 'DOCUMENT_REQUEST' 
            : 'NORMAL';
    }

    async _handleDocumentRequest(message, conversation, context) {
        logInfo('Processing document request', {
            whatsappId: message.from,
            category: conversation?.metadata?.category
        });

        // Verificar que haya una categoría válida
        const category = conversation?.metadata?.category;
        if (!category || category === 'unknown') {
            await this.whatsappService.sendTextMessage(
                message.from,
                "Para generar el documento de reclamación, necesito que primero me cuentes tu caso en detalle para poder ayudarte adecuadamente."
            );
            return { success: true, type: 'DOCUMENT_REQUEST_REJECTED' };
        }

        try {
            // Preparar datos del cliente
            const customerData = this._prepareCustomerData(conversation, context);

            // Obtener los mensajes de la conversación
            const messages = conversation.getMessages().map(msg => {
                return {
                    content: msg.text?.body || msg.content,
                    timestamp: msg.timestamp,
                    direction: msg.direction
                };
            }).filter(msg => msg.content);

            logInfo('Generando documento con LegalAgentSystem', {
                category,
                whatsappId: message.from,
                messagesCount: messages.length
            });

            // Procesar la queja
            const documentResult = await this.legalAgentSystem.processComplaint(
                category,
                messages,
                customerData
            );

            // Formatear y enviar el documento
            const formattedDocument = this._formatDocumentForWhatsApp(documentResult);
            await this.whatsappService.sendTextMessage(message.from, formattedDocument);

            // Actualizar metadata de la conversación
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString(),
                    documentType: category
                }
            );

            logInfo('Document generated and sent successfully', {
                whatsappId: message.from,
                category,
                documentType: category
            });

            return { success: true, type: 'DOCUMENT_GENERATED' };

        } catch (error) {
            logError('Error generating document', {
                error: error.message,
                whatsappId: message.from,
                category: category
            });

            await this.whatsappService.sendTextMessage(
                message.from,
                "Lo siento, hubo un problema al generar el documento. Por favor, intenta nuevamente o proporciona más detalles sobre tu caso."
            );

            return { success: false, type: 'DOCUMENT_GENERATION_FAILED' };
        }
    }

    _formatDocumentForWhatsApp(document) {
        return `📄 *DOCUMENTO DE RECLAMACIÓN*\n\n` +
               `*PARA:* ${document.companyName}\n` +
               `*DE:* ${document.customerName}\n` +
               `*ASUNTO:* ${document.reference}\n\n` +
               `*HECHOS:*\n${document.hechos.map((hecho, index) => 
                   `${index + 1}. ${hecho}`).join('\n')}\n\n` +
               `*PETICIÓN:*\n${document.peticion}\n\n` +
               `_Documento generado por JULI - Asistente Legal Virtual_\n` +
               `_Fecha: ${new Date().toLocaleDateString('es-CO')}_`;
    }

    async _handleNormalMessage(message, conversation, context) {
        await this.conversationService.processIncomingMessage(
            this._formatMessage(message, context)
        );

        if (message.type === 'text' || message.type === 'audio') {
            await this.whatsappService.markAsRead(message.id);
        }

        return { success: true, type: 'NORMAL_PROCESSED' };
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

    _prepareCustomerData(conversation, context) {
        return {
            name: context.contacts?.[0]?.profile?.name || 'Usuario',
            documentNumber: conversation.metadata?.documentNumber,
            phone: conversation.whatsappId,
            ...this._getServiceSpecificData(conversation)
        };
    }

    _getServiceSpecificData(conversation) {
        const category = conversation.metadata?.category;
        switch(category) {
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