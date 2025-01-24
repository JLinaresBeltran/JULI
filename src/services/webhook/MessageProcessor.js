const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');

const DOCUMENT_TRIGGER = "juli quiero el documento";

class MessageProcessor {
    constructor(conversationService, whatsappService, wsManager, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
    }

    async processMessage(message, context) {
        try {
            // 1. Verificar y validar mensaje
            if (!message?.type || !message.from) {
                throw new Error('Invalid message structure');
            }

            // 2. Obtener conversación existente
            const conversation = await this.conversationService.getConversation(message.from);

            // 3. Detectar trigger documento antes de clasificación
            if (message.type === 'text' && 
                message.text?.body?.toLowerCase().trim() === DOCUMENT_TRIGGER) {
                
                logInfo('Document trigger detected', { whatsappId: message.from });
                
                // Marcar mensaje como leído
                await this.whatsappService.markAsRead(message.id);

                // Si no hay conversación previa, informar al usuario
                if (!conversation?.category) {
                    await this.whatsappService.sendTextMessage(
                        message.from,
                        "Para generar el documento, primero necesito entender tu caso. Por favor, cuéntame tu situación."
                    );
                    return { success: false, reason: 'no_category' };
                }

                // Procesar solicitud de documento
                return await this._handleDocumentRequest(conversation, context);
            }

            // 4. Procesar como mensaje normal si no es trigger
            return await this._processNormalMessage(message, conversation, context);
        } catch (error) {
            logError('Message processing error', { error });
            throw error;
        }
    }

    async _handleDocumentRequest(conversation, context) {
        try {
            const customerData = {
                name: context.contacts?.[0]?.profile?.name || 'Usuario',
                documentNumber: context.contacts?.[0]?.wa_id || conversation.whatsappId,
                email: conversation.metadata?.email,
                phone: conversation.from,
                address: "Dirección por defecto",
                numero_reserva: "ABC123",
                numero_vuelo: "XY123",
                fecha_vuelo: "2024-01-24",
                ruta: "BOG-MIA",
                valor_tiquete: "1000000"
            };
    
            if (!customerData.email) {
                await this.whatsappService.sendTextMessage(
                    conversation.whatsappId,
                    "Indícame tu correo electrónico"
                );
                return { success: false, missingFields: ['email'] };
            }
    
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estoy procesando tu solicitud para generar el documento. Esto puede tomar unos momentos."
            );
    
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
                "¡Listo! Tu documento ha sido generado y enviado a tu correo electrónico."
            );
    
            return { success: true, documentGenerated: true };
        } catch (error) {
            logError('Error generating document', { error });
            throw error;
        }
    }

    _validateCustomerData(customerData) {
        const requiredFields = ['name', 'documentNumber', 'email', 'address'];
        return requiredFields.filter(field => !customerData[field]);
    }

    async _handleFirstInteraction(message, context) {
        logInfo('First interaction detected', {
            userId: message.from,
            userName: context.contacts?.[0]?.profile?.name
        });

        await welcomeHandlerService.handleInitialInteraction(
            message.from,
            context.contacts?.[0]?.profile?.name || 'Usuario'
        );

        const conversation = await this.conversationService.createConversation(
            message.from,
            message.from
        );

        if (this.wsManager) {
            this.wsManager.broadcastConversationUpdate(conversation);
        }

        return {
            success: true,
            isFirstInteraction: true,
            conversation
        };
    }

    async _handleCategoryClassification(message, conversation) {
        try {
            const classification = queryClassifierService.classifyQuery(message.text.body);
            
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                { 
                    category: classification.category,
                    classificationConfidence: classification.confidence 
                }
            );

            logInfo('Conversation categorized', {
                whatsappId: conversation.whatsappId,
                category: classification.category,
                confidence: classification.confidence
            });

            await this._sendCategoryConfirmation(
                conversation.whatsappId, 
                classification.category
            );

            return classification;

        } catch (error) {
            logError('Error in category classification', {
                error: error.message,
                messageId: message.id,
                conversationId: conversation.whatsappId
            });
            throw error;
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

    async _forwardToChatbase(message, category) {
        try {
            await chatbaseController[`handle${this._formatCategory(category)}`]({
                body: { message }
            }, {
                json: () => {}
            });
        } catch (error) {
            logError('Error forwarding to Chatbase', {
                error: error.message,
                category
            });
        }
    }

    _formatCategory(category) {
        return category.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    formatMessage(message, context = {}) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            content: message.text?.body || '',
            metadata: {
                ...context.metadata,
                profile: context.contacts?.[0]?.profile
            }
        };
    }
}

module.exports = MessageProcessor;