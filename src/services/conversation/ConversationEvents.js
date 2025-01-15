// src/services/conversation/ConversationEvents.js
const EventEmitter = require('events');
const { logError } = require('../../utils/logger');

class ConversationEvents extends EventEmitter {
    constructor() {
        super();
        this.setupHandlers();
    }

    setupHandlers() {
        // Este método será sobrescrito por ConversationService
    }

    handleMessageReceived(data) {
        // Base handler
        this.emit('broadcast', {
            type: 'newMessage',
            data
        });
    }

    handleConversationUpdated(data) {
        // Base handler
        this.emit('broadcast', {
            type: 'conversationUpdate',
            data
        });
    }

    handleConversationClosed(data) {
        // Base handler
        this.emit('broadcast', {
            type: 'conversationClosed',
            data
        });
    }

    handleError(error) {
        logError('Error en eventos de conversación', {
            error: error.message,
            stack: error.stack
        });
    }
}

module.exports = ConversationEvents;