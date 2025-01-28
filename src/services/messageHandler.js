// src/services/documentRequestHandler.js
const { logInfo, logError } = require('../utils/logger');

class DocumentRequestHandler {
    constructor(conversationService, whatsappService, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        
        // Triggers for document generation
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

            // 1. Validate conversation and category
            if (!this._validateConversationForDocument(conversation)) {
                await this._sendInvalidConversationMessage(message.from);
                return { success: false, reason: 'INVALID_CONVERSATION' };
            }

            // 2. Get customer data
            const customerData = this._prepareCustomerData(conversation, context);
            
            // 3. Process complaint and generate document
            const documentResult = await this._generateDocument(conversation, customerData);
            if (!documentResult.success) {
                return documentResult;
            }

            // 4. Send document to user
            await this._sendDocumentToUser(message.from, documentResult.document);

            // 5. Update conversation metadata
            await this._updateConversationMetadata(conversation, documentResult);

            return { success: true, type: 'DOCUMENT_GENERATED' };

        } catch (error) {
            logError('Error in document request handler', {
                error: error.message,
                whatsappId: message.from,
                stack: error.stack
            });
            
            await this._sendErrorMessage(message.from);
            return { success: false, reason: 'PROCESSING_ERROR', error };
        }
    }

    async _validateConversationForDocument(conversation) {
        if (!conversation) return false;

        // Intentar obtener la categoría de todas las fuentes posibles
        let category = conversation.category || 
                      conversation?.metadata?.category ||
                      conversation?.metadata?.documentType;

        logInfo('Validating conversation for document', {
            whatsappId: conversation.whatsappId,
            hasCategory: !!category,
            categoryValue: category,
            metadataCategory: conversation?.metadata?.category,
            conversationCategory: conversation?.category,
            documentType: conversation?.metadata?.documentType
        });

        // Si no hay categoría, intentar reclasificar usando el último mensaje
        if (!category || category === 'unknown') {
            const messages = conversation.getMessages();
            if (messages && messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                if (lastMessage.text?.body) {
                    logInfo('Attempting to reclassify conversation', {
                        whatsappId: conversation.whatsappId,
                        lastMessage: lastMessage.text.body
                    });
                    
                    const classificationResult = await this.conversationService.classifyMessage(lastMessage);
                    category = classificationResult.category;
                    
                    if (category && category !== 'unknown') {
                        await this.conversationService.updateConversationMetadata(
                            conversation.whatsappId,
                            {
                                category: category,
                                classificationConfidence: classificationResult.confidence,
                                lastClassificationTimestamp: new Date().toISOString()
                            }
                        );
                    }
                }
            }
        }

        return category && category !== 'unknown';
    }

    async _generateDocument(conversation, customerData) {
        const category = conversation.category || conversation.metadata?.category;
        const messages = conversation.getMessages();

        if (!messages || messages.length === 0) {
            return { success: false, reason: 'NO_MESSAGES' };
        }

        try {
            const result = await this.legalAgentSystem.processComplaint(
                category,
                messages,
                customerData
            );

            if (!result || !result.hechos || !result.peticion) {
                return { success: false, reason: 'INVALID_DOCUMENT_CONTENT' };
            }

            return { success: true, document: result };

        } catch (error) {
            logError('Error generating document', {
                error: error.message,
                category,
                whatsappId: conversation.whatsappId
            });
            return { success: false, reason: 'GENERATION_ERROR', error };
        }
    }

    _prepareCustomerData(conversation, context) {
        const category = conversation.category || conversation.metadata?.category;
        
        return {
            name: context.contacts?.[0]?.profile?.name || 'Usuario',
            documentNumber: conversation.metadata?.documentNumber,
            email: conversation.metadata?.email,
            phone: conversation.whatsappId,
            address: conversation.metadata?.address || 'No especificado',
            ...this._getServiceSpecificData(category, conversation.metadata)
        };
    }

    _getServiceSpecificData(category, metadata = {}) {
        const specificDataMap = {
            'servicios_publicos': {
                cuenta_contrato: metadata?.accountNumber,
                tipo_servicio: metadata?.serviceType,
                periodo_facturacion: metadata?.billingPeriod
            },
            'telecomunicaciones': {
                numero_linea: metadata?.lineNumber,
                plan_contratado: metadata?.plan,
                fecha_contratacion: metadata?.contractDate
            },
            'transporte_aereo': {
                numero_reserva: metadata?.reservationNumber,
                numero_vuelo: metadata?.flightNumber,
                fecha_vuelo: metadata?.flightDate,
                ruta: metadata?.route,
                valor_tiquete: metadata?.ticketValue
            }
        };

        return specificDataMap[category] || {};
    }

    async _sendDocumentToUser(whatsappId, document) {
        const formattedDocument = this._formatDocumentForWhatsApp(document);
        await this.whatsappService.sendTextMessage(whatsappId, formattedDocument);
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

    async _updateConversationMetadata(conversation, documentResult) {
        await this.conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                documentGenerated: true,
                documentGeneratedTimestamp: new Date().toISOString(),
                documentType: conversation.category || conversation.metadata?.category,
                lastDocumentData: documentResult.document
            }
        );
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