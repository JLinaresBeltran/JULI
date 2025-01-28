// src/services/documentRequestHandler.js
const { logInfo, logError } = require('../utils/logger');

class DocumentRequestHandler {
    constructor(conversationService, whatsappService, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        
        // Triggers para la generación de documentos
        this.DOCUMENT_TRIGGERS = [
            "juli quiero el documento",
            "quiero el documento",
            "necesito el documento",
            "generar documento",
            "genera el documento",
            "documento por favor"
        ];
    }

    isDocumentRequest(message) {
        if (message.type !== 'text') return false;
        const normalizedText = message.text.body.toLowerCase().trim();
        return this.DOCUMENT_TRIGGERS.some(trigger => 
            normalizedText.includes(trigger.toLowerCase())
        );
    }

    async handleDocumentRequest(message, conversation, context) {
        try {
            // 1. Validar que tengamos una categoría válida
            if (!this._validateConversationForDocument(conversation)) {
                await this._sendInvalidConversationMessage(message.from);
                return { success: false, reason: 'INVALID_CONVERSATION' };
            }

            // 2. Verificar si estamos esperando un email
            if (conversation.metadata?.awaitingEmail) {
                return this._handleEmailSubmission(message, conversation);
            }

            // 3. Si no tenemos email, solicitarlo
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
                    "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
                );

                return { success: true, type: 'EMAIL_REQUESTED' };
            }

            // 4. Si tenemos email, proceder con la generación
            return await this._processDocumentGeneration(conversation);

        } catch (error) {
            console.error('Error en document request handler:', error);
            await this._sendErrorMessage(message.from);
            throw error;
        }
    }

    _validateConversationForDocument(conversation) {
        if (!conversation) return false;
        const category = conversation.category || conversation.metadata?.category;
        return category && category !== 'unknown';
    }

    async _handleEmailSubmission(message, conversation) {
        const email = message.text.body.trim();
        
        if (!this._isValidEmail(email)) {
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "El correo electrónico no es válido. Por favor, ingresa un correo válido."
            );
            return { success: true, type: 'INVALID_EMAIL' };
        }

        return await this._processDocumentGeneration(conversation, email);
    }

    async _processDocumentGeneration(conversation, email = null) {
        const category = conversation.category || conversation.metadata?.category;
        const customerData = this._prepareCustomerData(conversation, email);

        try {
            // Generar el documento
            const result = await this.legalAgentSystem.processComplaint(
                category,
                conversation.getMessages(),
                customerData
            );

            await this.documentService.generateDocument(
                category,
                result,
                customerData
            );

            // Actualizar metadata de la conversación
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString(),
                    email: email || conversation.metadata?.email,
                    awaitingEmail: false,
                    documentRequestPending: false
                }
            );

            // Notificar al usuario
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return { success: true, type: 'DOCUMENT_GENERATED' };
        } catch (error) {
            console.error('Error generando documento:', error);
            throw error;
        }
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

    async _sendInvalidConversationMessage(whatsappId) {
        await this.whatsappService.sendTextMessage(
            whatsappId,
            "Para generar el documento de reclamación, necesito que primero me cuentes tu caso para poder ayudarte adecuadamente."
        );
    }

    async _sendErrorMessage(whatsappId) {
        await this.whatsappService.sendTextMessage(
            whatsappId,
            "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
        );
    }
}

module.exports = DocumentRequestHandler;