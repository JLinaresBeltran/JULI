const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');

class MessageProcessor {
  constructor(conversationService, whatsappService, wsManager, legalAgentSystem, documentService) {
      this.conversationService = conversationService;
      this.whatsappService = whatsappService;
      this.wsManager = wsManager;
      this.legalAgentSystem = legalAgentSystem;
      this.documentService = documentService;

      // Patrones que indican solicitud de documento o correo
      this.emailRequestPatterns = [
          "juli quiero el documento",
          "necesito tu correo electrónico",
          "por favor proporciona tu correo",
          "indica tu correo electrónico",
          "enviaremos el documento a tu correo",
          "necesitamos tu email"
      ];
  }

  isRequestingEmail(message) {
      if (!message || typeof message !== 'string') return false;
      
      const normalizedMessage = message.toLowerCase();
      const matchedPattern = this.emailRequestPatterns.find(pattern => 
          normalizedMessage.includes(pattern.toLowerCase())
      );

      if (matchedPattern) {
          logInfo('Email request pattern matched', {
              originalMessage: message,
              normalizedMessage: normalizedMessage,
              matchedPattern: matchedPattern
          });
          return true;
      }

      return false;
  }

  _isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async processMessage(message, context) {
    try {
        const conversation = await this.conversationService.getConversation(message.from);
        return await this._processNormalMessage(message, conversation, context);
    } catch (error) {
        logError('Message processing error', { error });
        throw error;
    }
  }

  async _processNormalMessage(message, conversation, context) {
      try {
          logInfo('Processing message', {
              type: message.type,
              content: message.text?.body,
              awaitingEmail: conversation?.metadata?.awaitingEmail,
              isDocumentRequest: message.text?.body ? this.isRequestingEmail(message.text.body) : false
          });

          // Verificar si el usuario está solicitando el documento explícitamente
          if (message.text?.body && this.isRequestingEmail(message.text.body)) {
              logInfo('Document request detected in message', {
                  text: message.text.body,
                  pattern: message.text.body.toLowerCase()
              });

              await this.conversationService.updateConversationMetadata(
                  conversation.whatsappId,
                  { 
                      awaitingEmail: true,
                      emailRequestTimestamp: new Date().toISOString()
                  }
              );

              await this.whatsappService.sendTextMessage(
                  conversation.whatsappId,
                  "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
              );

              return { success: true, messageProcessed: true };
          }

          // Verificar si estamos esperando un correo
          if (message.type === 'text' && conversation?.metadata?.awaitingEmail) {
              const email = message.text.body.trim();
              if (this._isValidEmail(email)) {
                  await this._handleEmailSubmission(message, conversation, context);
                  return { success: true, messageProcessed: true };
              } else {
                  await this.whatsappService.sendTextMessage(
                      conversation.whatsappId,
                      "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                  );
                  return { success: true, messageProcessed: true };
              }
          }

          // Flujo normal de procesamiento
          if (conversation.shouldClassify()) {
              const classification = await this._handleCategoryClassification(message, conversation);
              const chatbaseResponse = await this._forwardToChatbase(message, classification.category);
              
              // Verificar si Chatbase está solicitando correo
              if (this.isRequestingEmail(chatbaseResponse)) {
                  await this.conversationService.updateConversationMetadata(
                      conversation.whatsappId,
                      { 
                          awaitingEmail: true,
                          emailRequestTimestamp: new Date().toISOString()
                      }
                  );
                  logInfo('Esperando correo electrónico', { 
                      whatsappId: conversation.whatsappId,
                      source: 'chatbase_response'
                  });
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
          logError('Error processing normal message', { error });
          throw error;
      }
  }

  async _handleEmailSubmission(message, conversation, context) {
      const email = message.text.body.trim();
      
      try {
          logInfo('Iniciando proceso de documento legal', { 
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
              address: conversation.metadata?.address || "No especificado"
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

      } catch (error) {
          logError('Error en procesamiento de documento', { error });
          await this.whatsappService.sendTextMessage(
              conversation.whatsappId,
              "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
          );
          throw error;
      }
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
          logError('Error in category classification', { error });
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
          const response = await chatbaseController[`handle${this._formatCategory(category)}`]({
              body: { message }
          }, {
              json: () => {}
          });

          logInfo('Chatbase response received', {
              category,
              responseText: response?.text,
              isRequestingEmail: this.isRequestingEmail(response?.text)
          });

          return response?.text || '';
      } catch (error) {
          logError('Error forwarding to Chatbase', { error });
          return '';
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