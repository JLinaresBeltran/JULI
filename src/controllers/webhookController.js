// src/controllers/webhookController.js
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const { logInfo, logError } = require('../utils/logger');

// Validadores
const WebhookValidator = {
  validatePayload(body) {
    if (!body || !body.object) {
      throw new Error('Invalid payload structure');
    }

    if (body.object !== 'whatsapp_business_account') {
      throw new Error('Unexpected webhook object type');
    }

    if (!Array.isArray(body.entry)) {
      throw new Error('Invalid entry structure');
    }

    return true;
  },

  validateVerification(mode, token, challenge, verifyToken) {
    return mode === 'subscribe' && token === verifyToken ? challenge : null;
  }
};

// Procesador de Mensajes
const MessageProcessor = {
  constructMessageData(message, changeContext) {
    return {
      id: message.id,
      from: message.from,
      timestamp: message.timestamp,
      type: message.type,
      text: message.text?.body,
      audio: message.audio?.id,
      profile: changeContext.value.contacts?.[0],
      status: message.status || 'received'
    };
  },

  async processIndividualMessage(messageData) {
    try {
      const conversation = await conversationService.processIncomingMessage(messageData);

      if (messageData.type === 'text') {
        await whatsappService.sendReadReceipt(messageData.id);
      }

      logInfo('Message Processed Successfully', {
        messageId: messageData.id,
        conversationId: conversation.whatsappId,
        messageType: messageData.type,
        messageCount: conversation.messages.length,
        conversationStatus: conversation.status
      });

      return conversation;
    } catch (error) {
      logError('Message Processing Failed', {
        error: error.message,
        messageId: messageData.id,
        type: messageData.type
      });
      throw error;
    }
  },

  async processMessages(messages, changeContext) {
    const results = {
      processed: 0,
      errors: 0,
      details: []
    };

    for (const message of messages) {
      try {
        const messageData = this.constructMessageData(message, changeContext);
        await this.processIndividualMessage(messageData);
        results.processed++;
        results.details.push({
          id: message.id,
          status: 'success',
          type: message.type
        });
      } catch (error) {
        results.errors++;
        results.details.push({
          id: message.id,
          status: 'error',
          type: message.type,
          error: error.message
        });
      }
    }

    return results;
  }
};

// Procesador de Webhook
const WebhookProcessor = {
  async processChange(change) {
    const results = {
      processed: 0,
      errors: 0,
      details: []
    };

    if (change.value.messages) {
      logInfo('Processing Messages', {
        messageCount: change.value.messages.length,
        field: change.field
      });

      const messageResults = await MessageProcessor.processMessages(
        change.value.messages,
        change
      );

      results.processed += messageResults.processed;
      results.errors += messageResults.errors;
      results.details = results.details.concat(messageResults.details);
    }

    return results;
  },

  async processEntry(entry) {
    const results = {
      processed: 0,
      errors: 0,
      details: []
    };

    for (const change of entry.changes) {
      const changeResults = await this.processChange(change);
      results.processed += changeResults.processed;
      results.errors += changeResults.errors;
      results.details = results.details.concat(changeResults.details);
    }

    return results;
  }
};

// Controladores principales
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  logInfo('Webhook Verification Request', {
    mode,
    tokenMatch: token === VERIFY_TOKEN,
    hasChallenge: !!challenge
  });

  const validChallenge = WebhookValidator.validateVerification(
    mode,
    token,
    challenge,
    VERIFY_TOKEN
  );

  if (validChallenge) {
    logInfo('Webhook Verified Successfully');
    res.status(200).send(validChallenge);
  } else {
    logError('Webhook Verification Failed', {
      mode,
      tokenMatch: token === VERIFY_TOKEN
    });
    res.status(403).send('Forbidden');
  }
};

exports.receiveMessage = async (req, res) => {
  const startTime = Date.now();
  const results = {
    processed: 0,
    errors: 0,
    details: []
  };

  try {
    const body = req.body;
    logInfo('Webhook Payload Received', {
      headers: req.headers,
      body: body
    });

    WebhookValidator.validatePayload(body);

    for (const entry of body.entry) {
      const entryResults = await WebhookProcessor.processEntry(entry);
      results.processed += entryResults.processed;
      results.errors += entryResults.errors;
      results.details = results.details.concat(entryResults.details);
    }

    const processingTime = Date.now() - startTime;
    logInfo('Webhook Processing Summary', {
      totalMessages: results.processed + results.errors,
      processedMessages: results.processed,
      failedMessages: results.errors,
      processingTimeMs: processingTime,
      activeConversations: conversationService.activeConversations.size
    });

    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logError('Webhook Processing General Error', {
      error: error.message,
      processingTimeMs: processingTime,
      stack: error.stack
    });

    res.status(200).send('EVENT_RECEIVED');
  }
};

exports.getConversations = async (req, res) => {
  try {
    logInfo('Requesting Conversations List');
    
    const conversations = Array.from(conversationService.activeConversations.values());
    const formattedConversations = conversations.map(conv => ({
      whatsappId: conv.whatsappId,
      userPhoneNumber: conv.userPhoneNumber,
      messages: conv.messages.map(msg => ({
        id: msg.id,
        timestamp: msg.timestamp,
        type: msg.type,
        direction: msg.direction,
        content: msg.content,
        status: msg.status
      })),
      startTime: conv.startTime,
      lastUpdateTime: conv.lastUpdateTime,
      status: conv.status,
      metadata: conv.metadata
    }));

    logInfo('Sending Conversations List', {
      count: formattedConversations.length,
      activeConversations: formattedConversations.length,
      timestamp: new Date().toISOString()
    });

    res.status(200).json(formattedConversations);
  } catch (error) {
    logError('Error Retrieving Conversations', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Error retrieving conversations',
      message: error.message
    });
  }
};

exports.getConversationAnalytics = async (req, res) => {
  try {
    logInfo('Requesting Conversation Analytics');
    
    const analytics = await conversationService.getConversationAnalytics();
    logInfo('Analytics Generated Successfully', {
      activeConversations: analytics.activeConversations,
      totalMessages: analytics.conversations.reduce((acc, conv) => acc + conv.messageCount, 0),
      timestamp: new Date().toISOString()
    });

    res.status(200).json(analytics);
  } catch (error) {
    logError('Error Generating Analytics', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};