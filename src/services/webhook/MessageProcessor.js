const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');

const documentTriggerPhrase = "juli quiero el documento";

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
            logInfo('Processing message', {
                messageId: message.id,
                type: message.type,
                from: message.from
            });
 
            const conversation = await this.conversationService.getConversation(message.from);
            
            // Interceptar solicitud de documento
            if (message.type === 'text' && message.text.body.toLowerCase() === 'juli quiero el documento') {
                if (conversation?.category) {
                    await this._handleDocumentRequest(conversation, context);
                    return;
                }
            }
 
            // Flujo normal
            const isFirstInteraction = !conversation;
            if (isFirstInteraction) {
                await this._handleFirstInteraction(message, context);
                return {
                    success: true,
                    isFirstInteraction: true
                };
            }
 
            const formattedMessage = this.formatMessage(message, context);
            const updatedConversation = await this.conversationService.processIncomingMessage(
                formattedMessage,
                { createIfNotExists: true }
            );
 
            if (updatedConversation.category && message.type === 'text') {
                await this._forwardToChatbase(message.text.body, updatedConversation.category);
            }
 
            if (message.type === 'text') {
                await this.whatsappService.markAsRead(message.id);
            }
 
            if (this.wsManager) {
                this.wsManager.broadcastConversationUpdate(updatedConversation);
            }
 
            return {
                success: true,
                isFirstInteraction: false,
                conversation: updatedConversation
            };
 
        } catch (error) {
            logError('Failed to process message', {
                error: error.message,
                messageId: message.id,
                stack: error.stack
            });
            throw error;
        }
    }

    async _handleDocumentRequest(conversation, context) {
        try {
            const customerData = {
                name: context.contacts?.[0]?.profile?.name,
                documentNumber: conversation.metadata?.documentNumber,
                email: conversation.metadata?.email,
                phone: conversation.from,
                address: conversation.metadata?.address
            };
 
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estoy preparando tu documento. En unos momentos lo recibirás."
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
                "Tu documento ha sido generado y enviado a tu correo electrónico."
            );
 
        } catch (error) {
            logError('Error generating document', {
                error: error.message,
                whatsappId: conversation.whatsappId,
                stack: error.stack
            });
            
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Lo siento, hubo un problema generando el documento. Por favor intenta nuevamente."
            );
        }
    }

   async _handleFirstInteraction(message, context) {
       logInfo('First interaction detected, sending welcome message', {
           userId: message.from,
           userName: context.contacts?.[0]?.profile?.name
       });

       await welcomeHandlerService.handleInitialInteraction(
           message.from,
           context.contacts?.[0]?.profile?.name || 'Usuario'
       );

       await this.conversationService.createConversation(
           message.from,
           message.from
       );
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