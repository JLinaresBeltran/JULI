// src/services/messageHandler.js
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
                address: conversation.metadata?.address || ''
            };

            // Enviar al agente legal para procesar
            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            // Confirmar procesamiento
            await this.whatsappService.sendTextMessage(
                message.from,
                "He terminado de procesar tu caso. Para enviarte el documento necesitaré tu correo electrónico."
            );

            // Actualizar metadata de la conversación
            await this.conversationService.updateConversationMetadata(
                message.from,
                {
                    awaitingEmail: true,
                    documentData: result,
                    documentRequestTimestamp: new Date().toISOString()
                }
            );

            return { success: true, type: 'DOCUMENT_PROCESSED' };

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
}

module.exports = DocumentRequestHandler;