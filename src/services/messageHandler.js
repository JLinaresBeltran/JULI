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
                hasEmail: Boolean(conversation.metadata?.email)
            });
    
            // Extraer datos de WhatsApp
            const userName = conversation.metadata?.customerName || 'Usuario';
            const userPhone = conversation.whatsappId;
    
            // Verificar si ya tenemos el correo
            if (!conversation.metadata?.email) {
                await whatsappService.sendTextMessage(
                    message.from,
                    "Para generarte el documento legal, necesito tu correo electrónico. Por favor, escríbelo a continuación."
                );
    
                // Marcar conversación como esperando email
                await this.updateConversationMetadata(conversation.whatsappId, {
                    awaitingEmail: true,
                    documentRequestPending: true,
                    customerName: userName,
                    phone: userPhone
                });
    
                return { success: true, status: 'AWAITING_EMAIL' };
            }
    
            // Si ya tenemos el correo, proceder con el documento
            return await this._processDocumentWithAgent(conversation);
    
        } catch (error) {
            logError('Error processing document request', {
                error: error.message,
                whatsappId: message.from
            });
    
            await whatsappService.sendTextMessage(
                message.from,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );
    
            return { success: false, error };
        }
    }
    
    async _processDocumentWithAgent(conversation) {
        try {
            // Preparar datos del usuario
            const userData = {
                name: conversation.metadata?.customerName,
                phone: conversation.whatsappId,
                email: conversation.metadata?.email
            };
    
            // Preparar la conversación para el agente
            const conversationText = conversation.messages
                .filter(msg => msg.type === 'text')
                .map(msg => {
                    const role = msg.from === conversation.whatsappId ? 'Usuario' : 'JULI';
                    return `${role}: ${msg.text.body}`;
                })
                .join('\n');
    
            // Procesar con el agente legal
            const result = await legalAgentSystem.processComplaint(
                conversation.category || 'unknown',
                conversationText,
                userData
            );
    
            // Generar documento
            await documentService.generateDocument(
                conversation.category,
                result,
                userData
            );
    
            // Notificar al usuario
            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );
    
            // Actualizar metadata de la conversación
            await this.updateConversationMetadata(conversation.whatsappId, {
                documentGenerated: true,
                documentGeneratedTimestamp: new Date().toISOString(),
                awaitingEmail: false,
                documentRequestPending: false
            });
    
            return { success: true, status: 'DOCUMENT_GENERATED' };
        } catch (error) {
            logError('Error generating document', {
                error: error.message,
                whatsappId: conversation.whatsappId
            });
            throw error;
        }
    }
}

module.exports = DocumentRequestHandler;