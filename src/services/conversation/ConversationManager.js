// src/services/conversation/ConversationManager.js
const { logInfo, logError } = require('../../utils/logger');
const ConversationBase = require('./ConversationBase');

class ConversationManager {
    constructor() {
        this.conversations = new Map();
        this.config = {
            timeout: 30 * 60 * 1000,
            heartbeatInterval: 45000,
            maxReconnectAttempts: 5,
            maxRetryAttempts: 3
        };
    }

    create(whatsappId, userPhoneNumber) {
        if (!whatsappId || !userPhoneNumber) {
            throw new Error('WhatsApp ID y número de teléfono son requeridos');
        }

        const conversation = new ConversationBase(whatsappId, userPhoneNumber);
        this.conversations.set(whatsappId, conversation);
        
        logInfo('Nueva conversación creada', { 
            whatsappId, 
            userPhoneNumber,
            timestamp: conversation.startTime 
        });

        return conversation;
    }

    get(whatsappId) {
        return this.conversations.get(whatsappId);
    }

    delete(whatsappId) {
        return this.conversations.delete(whatsappId);
    }

    getAll() {
        return Array.from(this.conversations.values());
    }

    getCount() {
        return this.conversations.size;
    }

    cleanupInactive() {
        const now = Date.now();
        const inactiveIds = Array.from(this.conversations.entries())
            .filter(([_, conv]) => now - conv.lastUpdateTime > this.config.timeout)
            .map(([id]) => id);

        inactiveIds.forEach(id => this.delete(id));
        
        return inactiveIds.length;
    }
}

module.exports = ConversationManager;