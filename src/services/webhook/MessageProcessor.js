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

           // 1. Obtener la conversación
           const conversation = await this.conversationService.getConversation(message.from);
           const isFirstInteraction = !conversation;
           
           // 2. Si es primera interacción, enviar mensaje de bienvenida
           if (isFirstInteraction) {
               await this._handleFirstInteraction(message, context);
               return {
                   success: true,
                   isFirstInteraction: true
               };
           }

           // 3. Si es la primera respuesta después del mensaje de bienvenida
           if (conversation && !conversation.category && message.type === 'text') {
               await this._handleCategoryClassification(message, conversation);
           }

           // 4. Verificar si es solicitud de documento
           if (message.type === 'text' && 
               message.text.body.toLowerCase().includes(documentTriggerPhrase)) {
               await this._handleDocumentRequest(conversation, context);
               return {
                   success: true,
                   isDocumentRequest: true
               };
           }

           // 5. Procesar el mensaje normalmente
           const formattedMessage = this.formatMessage(message, context);
           const updatedConversation = await this.conversationService.processIncomingMessage(
               formattedMessage,
               { createIfNotExists: true }
           );

           // 6. Procesar el mensaje con Chatbase si ya está clasificado
           if (updatedConversation.category && message.type === 'text') {
               await this._forwardToChatbase(message.text.body, updatedConversation.category);
           }

           // 7. Marcar como leído si es mensaje de texto
           if (message.type === 'text') {
               await this.whatsappService.markAsRead(message.id);
           }

           // 8. Notificar por WebSocket
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
           if (!conversation.category) {
               await this.whatsappService.sendTextMessage(
                   conversation.whatsappId,
                   "Necesito clasificar primero tu caso. Por favor, cuéntame brevemente tu situación."
               );
               return;
           }

           const validCategories = ['servicios_publicos', 'telecomunicaciones', 'transporte_aereo'];
           if (!validCategories.includes(conversation.category)) {
               logError('Invalid category detected', {
                   category: conversation.category,
                   whatsappId: conversation.whatsappId
               });
               await this.whatsappService.sendTextMessage(
                   conversation.whatsappId,
                   "Lo siento, no puedo generar un documento para esta categoría."
               );
               return;
           }

           const customerData = {
               name: context.contacts?.[0]?.profile?.name || 'Usuario',
               documentNumber: conversation.metadata?.documentNumber,
               email: conversation.metadata?.email,
               phone: conversation.from,
               address: conversation.metadata?.address
           };

           logInfo('Processing document request', {
               category: conversation.category,
               whatsappId: conversation.whatsappId
           });

           const result = await this.legalAgentSystem.processComplaint(
               conversation.category,
               conversation,
               customerData
           );

           const doc = await this.documentService.generateDocument(
               conversation.category,
               result,
               customerData
           );

           await this.whatsappService.sendTextMessage(
               conversation.whatsappId,
               "Tu documento ha sido generado y será enviado a tu correo electrónico. Por favor verifica tu bandeja de entrada."
           );

           logInfo('Document generated successfully', {
               whatsappId: conversation.whatsappId,
               category: conversation.category
           });

       } catch (error) {
           logError('Error generating document', {
               error: error.message,
               whatsappId: conversation.whatsappId,
               stack: error.stack
           });

           await this.whatsappService.sendTextMessage(
               conversation.whatsappId,
               "Lo siento, hubo un problema generando tu documento. Por favor intenta nuevamente más tarde."
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