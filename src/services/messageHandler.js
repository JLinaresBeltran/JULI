// src/services/documentHandler.js
const { logInfo, logError } = require('../utils/logger');

class DocumentRequestHandler {
    constructor(conversationService, whatsappService, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        
        // Trigger específico para la generación de documento
        this.DOCUMENT_TRIGGER = "juli quiero el documento";
    }

    isDocumentRequest(message) {
        if (message.type !== 'text') return false;
        const normalizedText = message.text.body.toLowerCase().trim();
        return normalizedText.includes(this.DOCUMENT_TRIGGER);
    }

    async handleDocumentRequest(message, conversation) {
        try {
            logInfo('Processing document request', {
                whatsappId: message.from,
                category: conversation?.category,
                conversationId: conversation?.whatsappId
            });

            // Validar que la conversación tenga una categoría asignada
            if (!conversation?.category || conversation.category === 'unknown') {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Para generar el documento, primero necesito que me cuentes tu caso."
                );
                return { success: false, reason: 'NO_CATEGORY' };
            }

            // Validar datos necesarios
            if (!conversation.metadata?.email) {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Para enviarte el documento necesito tu correo electrónico. ¿Me lo podrías proporcionar?"
                );
                return { success: false, reason: 'NO_EMAIL' };
            }

            // Notificar al usuario que se está procesando su solicitud
            await this.whatsappService.sendTextMessage(
                message.from,
                "Estoy procesando tu solicitud para generar el documento legal..."
            );

            // Preparar datos para el agente legal
            const customerData = {
                name: conversation.metadata?.customerName || 'Usuario',
                phone: message.from,
                category: conversation.category,
                documentNumber: conversation.metadata?.documentNumber || '',
                email: conversation.metadata?.email || '',
                address: conversation.metadata?.address || '',
                ...this._getServiceSpecificData(conversation)
            };

            // Procesar la queja con el agente legal
            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            // Generar el documento
            const doc = await this.documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );

            // Notificar éxito al usuario
            await this.whatsappService.sendTextMessage(
                message.from,
                "¡Tu documento ha sido generado exitosamente! Te lo enviaré por correo electrónico."
            );

            // Actualizar metadata de la conversación
            await this.conversationService.updateConversationMetadata(
                message.from,
                {
                    documentGenerated: true,
                    documentGeneratedAt: new Date().toISOString(),
                    documentReference: result.reference
                }
            );

            return { 
                success: true, 
                type: 'DOCUMENT_GENERATED',
                document: doc,
                metadata: {
                    timestamp: new Date().toISOString(),
                    category: conversation.category,
                    customerEmail: conversation.metadata.email
                }
            };

        } catch (error) {
            logError('Error in document request handler', {
                error: error.message,
                whatsappId: message.from
            });

            await this.whatsappService.sendTextMessage(
                message.from,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );

            return { success: false, reason: 'PROCESSING_ERROR', error };
        }
    }

    _getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.numero_reserva,
                    numero_vuelo: conversation.metadata?.numero_vuelo,
                    fecha_vuelo: conversation.metadata?.fecha_vuelo,
                    ruta: conversation.metadata?.ruta,
                    valor_tiquete: conversation.metadata?.valor_tiquete
                };
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.cuenta_contrato,
                    tipo_servicio: conversation.metadata?.tipo_servicio,
                    periodo_facturacion: conversation.metadata?.periodo_facturacion
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.numero_linea,
                    plan_contratado: conversation.metadata?.plan_contratado,
                    fecha_contratacion: conversation.metadata?.fecha_contratacion
                };
            default:
                return {};
        }
    }

    _getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.numero_reserva,
                    numero_vuelo: conversation.metadata?.numero_vuelo,
                    fecha_vuelo: conversation.metadata?.fecha_vuelo,
                    ruta: conversation.metadata?.ruta,
                    valor_tiquete: conversation.metadata?.valor_tiquete
                };
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.cuenta_contrato,
                    tipo_servicio: conversation.metadata?.tipo_servicio,
                    periodo_facturacion: conversation.metadata?.periodo_facturacion
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.numero_linea,
                    plan_contratado: conversation.metadata?.plan_contratado,
                    fecha_contratacion: conversation.metadata?.fecha_contratacion
                };
            default:
                return {};
        }
    }
}

module.exports = DocumentRequestHandler;