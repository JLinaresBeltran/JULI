// src/services/messageHandler.js
const { logInfo, logError } = require('../utils/logger');

class DocumentRequestHandler {
    constructor(conversationService, whatsappService, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        
        // Triggers actualizados para generación de documentos
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
        return this.DOCUMENT_TRIGGERS.some(trigger => normalizedText.includes(trigger));
    }

    async handleDocumentRequest(message, conversation, context) {
        try {
            logInfo('Starting document request process', {
                whatsappId: message.from,
                conversationId: conversation?.whatsappId,
                category: conversation?.category || conversation?.metadata?.category
            });

            // Verificar si hay una categoría válida
            if (!this._validateConversationForDocument(conversation)) {
                await this._sendInvalidConversationMessage(message.from);
                return { success: false, reason: 'INVALID_CATEGORY' };
            }

            // Verificar y solicitar correo si es necesario
            if (conversation.metadata?.awaitingEmail) {
                const email = message.text.body.trim();
                if (this._isValidEmail(email)) {
                    return await this._processDocumentGeneration(conversation, email);
                } else {
                    await this.whatsappService.sendTextMessage(
                        message.from,
                        "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                    );
                    return { success: true, type: 'INVALID_EMAIL' };
                }
            }

            if (!conversation.metadata?.email) {
                await this.conversationService.updateConversationMetadata(
                    conversation.whatsappId,
                    {
                        awaitingEmail: true,
                        documentRequestPending: true
                    }
                );

                await this.whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
                );
                return { success: true, type: 'EMAIL_REQUESTED' };
            }

            return await this._processDocumentGeneration(conversation);

        } catch (error) {
            logError('Error in document request handler', {
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

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            return { success: true, type: 'DOCUMENT_GENERATED' };

        } catch (error) {
            logError('Error generating document', {
                error: error.message,
                whatsappId: conversation.whatsappId
            });
            throw error;
        }
    }

    _validateConversationForDocument(conversation) {
        if (!conversation) return false;
        const category = conversation.category || conversation.metadata?.category;
        return category && category !== 'unknown';
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
            "Para generar el documento de reclamación, necesito que primero me indiques tu direccion de correo electrónico."
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