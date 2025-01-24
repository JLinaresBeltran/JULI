const { logInfo, logError } = require('../utils/logger');
const welcomeHandlerService = require('./welcomeHandlerService');
const queryClassifierService = require('./queryClassifierService');
const chatbaseController = require('../controllers/chatbaseController');

const DOCUMENT_TRIGGER = "juli quiero el documento";
const EMAIL_TRIGGER = "/email";

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
          if (!message?.type || !message.from) {
              throw new Error('Invalid message structure');
          }

          const conversation = await this.conversationService.getConversation(message.from);
          
          if (!conversation) {
              return await this._handleFirstInteraction(message, context);
          }

          if (message.type === 'text' && message.text?.body?.toLowerCase().trim() === DOCUMENT_TRIGGER) {
              logInfo('Document trigger detected', { whatsappId: message.from });
              await this.whatsappService.markAsRead(message.id);
              return await this._handleDocumentRequest(conversation, context);
          }

          if (conversation?.metadata?.awaitingEmail && message.type === 'text') {
              const email = message.text.body.trim();
              if (this._validateEmail(email)) {
                  await this.conversationService.updateConversationMetadata(
                      conversation.whatsappId,
                      { 
                          email: email,
                          awaitingEmail: false,
                          documentPending: true
                      }
                  );
                  return await this._processDocumentGeneration(conversation, context);
              } else {
                  await this.whatsappService.sendTextMessage(
                      conversation.whatsappId,
                      "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                  );
                  return { success: false, reason: 'invalid_email' };
              }
          }

          return await this._processNormalMessage(message, conversation, context);

      } catch (error) {
          logError('Message processing error', { error });
          throw error;
      }
  }

  async _handleDocumentRequest(conversation, context) {
      try {
          if (!conversation?.metadata?.email) {
              await this.conversationService.updateConversationMetadata(
                  conversation.whatsappId,
                  { 
                      awaitingEmail: true,
                      documentPending: true
                  }
              );
              
              await this.whatsappService.sendTextMessage(
                  conversation.whatsappId,
                  "Por favor, indícame tu correo electrónico para enviarte el documento."
              );
              return { success: false, reason: 'no_email' };
          }

          return await this._processDocumentGeneration(conversation, context);
      } catch (error) {
          logError('Error generating document', { error });
          throw error;
      }
  }

  async _processDocumentGeneration(conversation, context) {
      try {
          if (!conversation.metadata.documentPending) {
              logError('Document generation attempted without pending flag');
              return { success: false, reason: 'invalid_state' };
          }

          await this.whatsappService.sendTextMessage(
              conversation.whatsappId,
              "Estoy procesando tu solicitud para generar el documento. Esto puede tomar unos momentos."
          );

          const customerData = this._prepareCustomerData(conversation, context);
          const messages = conversation.getMessages();
          
          logInfo('Starting document generation', {
              category: conversation.category,
              whatsappId: conversation.whatsappId
          });

          const result = await this.legalAgentSystem.processComplaint(
              conversation.category,
              messages,
              customerData
          );

          await this.documentService.generateDocument(
              conversation.category,
              result,
              customerData
          );

          await this.conversationService.updateConversationMetadata(
              conversation.whatsappId,
              { documentPending: false }
          );

          await this.whatsappService.sendTextMessage(
              conversation.whatsappId,
              "¡Listo! Tu documento ha sido generado y enviado a tu correo electrónico."
          );

          return { success: true, documentGenerated: true };
      } catch (error) {
          logError('Error in document generation', { error });
          throw error;
      }
  }

  _prepareCustomerData(conversation, context) {
      return {
          name: context.contacts?.[0]?.profile?.name || 'Usuario',
          documentNumber: context.contacts?.[0]?.wa_id || conversation.whatsappId,
          email: conversation.metadata?.email,
          phone: conversation.whatsappId,
          address: conversation.metadata?.address || "Dirección por defecto",
          ...this._getServiceSpecificData(conversation)
      };
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

  async _processNormalMessage(message, conversation, context) {
      try {
          if (conversation.shouldClassify()) {
              const classification = await this._handleCategoryClassification(message, conversation);
              await this._forwardToChatbase(message, classification.category);
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
          await chatbaseController[`handle${this._formatCategory(category)}`]({
              body: { message }
          }, {
              json: () => {}
          });
      } catch (error) {
          logError('Error forwarding to Chatbase', { error });
      }
  }

  _formatCategory(category) {
      return category.split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('');
  }

  _validateEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
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