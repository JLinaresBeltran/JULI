// src/services/conversation/ConversationManager.js
class ConversationManager {
    constructor() {
        this.conversations = new Map();
    }

    create(whatsappId, userPhoneNumber) {
        if (this.conversations.has(whatsappId)) {
            return this.conversations.get(whatsappId);
        }

        const conversation = {
            whatsappId,
            userPhoneNumber,
            messages: [],
            metadata: {},
            category: null,
            classificationConfidence: null,
            createdAt: new Date(),
            lastUpdateTime: Date.now(),
            status: 'active'
        };

        this.conversations.set(whatsappId, conversation);
        return conversation;
    }

    get(whatsappId) {
        return this.conversations.get(whatsappId);
    }

    update(whatsappId, updates) {
        const conversation = this.conversations.get(whatsappId);
        if (!conversation) return false;

        Object.assign(conversation, updates);
        conversation.lastUpdateTime = Date.now();
        return true;
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

    updateMetadata(whatsappId, metadata) {
        const conversation = this.conversations.get(whatsappId);
        if (!conversation) return false;

        conversation.metadata = {
            ...conversation.metadata,
            ...metadata
        };
        
        if (metadata.category) {
            conversation.category = metadata.category;
        }
        
        if (metadata.classificationConfidence) {
            conversation.classificationConfidence = metadata.classificationConfidence;
        }

        conversation.lastUpdateTime = Date.now();
        return true;
    }
}

module.exports = ConversationManager;