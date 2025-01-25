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
          if (conversation.shouldClassify()) {
              const classification = await this._handleCategoryClassification(message, conversation);
              const chatbaseResponse = await this._forwardToChatbase(message, classification.category);
              
              // Verificar si Chatbase está solicitando correo
              if (chatbaseResponse && chatbaseResponse.toLowerCase().includes("correo electrónico")) {
                  await conversationService.updateConversationMetadata(
                      conversation.whatsappId,
                      { awaitingEmail: true }
                  );
                  logInfo('Esperando correo electrónico', { whatsappId: conversation.whatsappId });
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