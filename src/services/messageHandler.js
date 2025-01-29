// src/services/messageHandler.js
const { logInfo, logError } = require('../utils/logger');

class DocumentRequestHandler {
    constructor(conversationService, whatsappService, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        
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

            // Validar correo electrónico
            if (!conversation.metadata?.email) {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Para enviarte el documento necesito tu correo electrónico. ¿Me lo podrías proporcionar?"
                );
                await this.conversationService.updateConversationMetadata(
                    message.from,
                    { awaitingEmail: true }
                );
                return { success: false, reason: 'NO_EMAIL' };
            }

            // Iniciar proceso de generación
            await this.whatsappService.sendTextMessage(
                message.from,
                "Estoy procesando tu solicitud para generar el documento legal..."
            );

            // Preparar datos recopilados
            const customerData = {
                name: conversation.metadata?.customerName || 'Usuario',
                phone: message.from,
                category: conversation.category,
                documentNumber: conversation.metadata?.documentNumber || 'No especificado',
                email: conversation.metadata?.email,
                address: conversation.metadata?.address || 'No especificado',
                ...this._getServiceSpecificData(conversation)
            };

            // Procesar con el agente legal
            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            // Generar documento
            const doc = await this.documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );

            // Confirmar generación exitosa
            await this.whatsappService.sendTextMessage(
                message.from,
                "¡Tu documento ha sido generado exitosamente! Te lo enviaré por correo electrónico."
            );

            // Actualizar metadata
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
                    customerEmail: customerData.email
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
                    numero_reserva: conversation.metadata?.numero_reserva || 'No especificado',
                    numero_vuelo: conversation.metadata?.numero_vuelo || 'No especificado',
                    fecha_vuelo: conversation.metadata?.fecha_vuelo || 'No especificado',
                    ruta: conversation.metadata?.ruta || 'No especificado',
                    valor_tiquete: conversation.metadata?.valor_tiquete || 'No especificado'
                };
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.cuenta_contrato || 'No especificado',
                    tipo_servicio: conversation.metadata?.tipo_servicio || 'No especificado',
                    periodo_facturacion: conversation.metadata?.periodo_facturacion || 'No especificado'
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.numero_linea || 'No especificado',
                    plan_contratado: conversation.metadata?.plan_contratado || 'No especificado',
                    fecha_contratacion: conversation.metadata?.fecha_contratacion || 'No especificado'
                };
            default:
                return {};
        }
    }
}

module.exports = DocumentRequestHandler;