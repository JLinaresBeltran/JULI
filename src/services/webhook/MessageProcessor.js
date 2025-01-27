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
        this.documentRequestKey = "juli quiero el documento";
    }

    async processMessage(message, context) {
        try {
            const conversation = await this.conversationService.getConversation(message.from);
            
            // Log inicial detallado
            const originalMessage = message.text?.body || '';
            const normalizedMessage = originalMessage.toLowerCase().trim();

            logInfo('Message processing started', {
                originalMessage,
                normalizedMessage,
                messageType: message.type,
                awaitingEmail: conversation?.metadata?.awaitingEmail,
                category: conversation?.category
            });

            // Verificar trigger de documento ANTES de cualquier otro procesamiento
            if (message.type === 'text' && normalizedMessage === this.documentRequestKey) {
                logInfo('Document request trigger detected', {
                    originalMessage,
                    normalizedMessage
                });
                return await this._handleDocumentRequest(message, conversation);
            }

            // Si el mensaje es el trigger de documento
            if (message.type === 'text' && normalizedMessage === this.documentRequestKey) {
                logInfo('Document request detected', {
                    originalMessage,
                    normalizedMessage,
                    matched: true
                });
                return await this._handleDocumentRequest(message, conversation);
            }

            // Si estamos esperando un correo electrónico
            if (message.type === 'text' && conversation?.metadata?.awaitingEmail) {
                const email = message.text.body.trim();
                if (this._isValidEmail(email)) {
                    return await this._handleEmailSubmission(message, conversation, context);
                }
                
                await this.whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                );
                return { success: true, messageProcessed: true };
            }

            // Procesamiento normal del mensaje
            return await this._processNormalMessage(message, conversation, context);
        } catch (error) {
            logError('Message processing error', { error });
            throw error;
        }
    }

    async _handleDocumentRequest(message, conversation) {
        try {
            logInfo('Processing document request', {
                whatsappId: conversation.whatsappId,
                category: conversation.category
            });

            // Verificar si ya hay una categoría asignada
            if (!conversation.category || conversation.category === 'unknown') {
                await this.whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "Por favor, cuéntame primero tu caso para poder ayudarte con el documento adecuado."
                );
                return { success: true, messageProcessed: true };
            }

            // Actualizar metadata para esperar el correo
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                { 
                    awaitingEmail: true,
                    emailRequestTimestamp: new Date().toISOString()
                }
            );

            // Solicitar correo electrónico
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
            );

            return { success: true, messageProcessed: true };
        } catch (error) {
            logError('Error handling document request', { error });
            throw error;
        }
    }

    async _handleEmailSubmission(message, conversation, context) {
        const email = message.text.body.trim();
        
        try {
            logInfo('Starting document generation process', { 
                email, 
                whatsappId: conversation.whatsappId,
                category: conversation.category 
            });

            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                { 
                    email: email,
                    awaitingEmail: false,
                    processingDocument: true
                }
            );

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estamos procesando tu solicitud para generar el documento legal..."
            );

            const customerData = {
                name: context.contacts?.[0]?.profile?.name || 'Usuario',
                documentNumber: conversation.metadata?.documentNumber,
                email: email,
                phone: message.from,
                address: conversation.metadata?.address || "No especificado",
                ...this._getServiceSpecificData(conversation)
            };

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

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                { processingDocument: false }
            );

            return { success: true, messageProcessed: true };

        } catch (error) {
            logError('Error processing document', { error });
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );
            throw error;
        }
    }

    async _processNormalMessage(message, conversation, context) {
        try {
            // Si es el primer mensaje o necesita clasificación
            if (conversation.shouldClassify()) {
                logInfo('Clasificando consulta', {
                    text: message.text?.body
                });

                const classification = await this._handleCategoryClassification(message, conversation);
                
                // Si ya tiene categoría, usar Chatbase
                if (classification.category !== 'unknown') {
                    const chatbaseResponse = await this._forwardToChatbase(message, classification.category);
                }
            } else {
                // Usar categoría existente si ya está clasificada
                if (conversation.category && conversation.category !== 'unknown') {
                    logInfo('Usando categoría existente', {
                        category: conversation.category
                    });
                    await this._forwardToChatbase(message, conversation.category);
                }
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

    async _forwardToChatbase(message, category) {
        try {
            logInfo('Iniciando nueva conversación con Chatbase', { category });

            const result = await chatbaseController[`handle${this._formatCategory(category)}`](
                message.text.body
            );

            if (result && result.text) {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    result.text
                );
            }

            return result;
        } catch (error) {
            logError('Error forwarding to Chatbase', { error });
            return null;
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

    _formatCategory(category) {
        return category.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    _getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.reservationNumber || "N/A",
                    numero_vuelo: conversation.metadata?.flightNumber || "N/A",
                    fecha_vuelo: conversation.metadata?.flightDate || new Date().toISOString().split('T')[0],
                    ruta: conversation.metadata?.route || "N/A",
                    valor_tiquete: conversation.metadata?.ticketValue || "0"
                };
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.accountNumber || "N/A",
                    tipo_servicio: conversation.metadata?.serviceType || "N/A",
                    periodo_facturacion: conversation.metadata?.billingPeriod || "N/A"
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.lineNumber || "N/A",
                    plan_contratado: conversation.metadata?.plan || "N/A",
                    fecha_contratacion: conversation.metadata?.contractDate || "N/A"
                };
            default:
                return {};
        }
    }

    formatMessage(message, context = {}) {
        const formattedMessage = {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            metadata: {
                ...context.metadata,
                profile: context.contacts?.[0]?.profile
            }
        };

        if (message.type === 'text') {
            formattedMessage.text = { body: message.text.body };
        }

        return formattedMessage;
    }
}

module.exports = MessageProcessor;