// src/services/conversation/ConversationBase.js
class ConversationBase {
    constructor(whatsappId, userPhoneNumber) {
        this.whatsappId = whatsappId;
        this.userPhoneNumber = userPhoneNumber;
        this.messages = [];
        this.startTime = new Date();
        this.lastUpdateTime = new Date();
        this.status = 'active';
        this.metadata = this.initMetadata();
    }

    initMetadata() {
        return {
            userProfile: null,
            currentIntent: null,
            documentGenerated: false,
            lastProcessedMessageId: null,
            audioTranscriptions: [],
            lastActivity: new Date(),
            messageCount: 0,
            hasUnreadMessages: false,
            reconnectAttempts: 0,
            lastHeartbeat: new Date(),
            processingErrors: []
        };
    }

    addMessage(message) {
        try {
            const formattedMessage = {
                id: message.id,
                timestamp: message.timestamp,
                type: message.type,
                direction: message.direction,
                content: message.text || message.audio || message.document || '',
                status: message.status || 'received',
                processed: false,
                attempts: 0,
                lastAttempt: null,
                error: null
            };

            this.messages.push(formattedMessage);
            this.updateMetadata({
                messageCount: this.metadata.messageCount + 1,
                lastActivity: new Date(),
                hasUnreadMessages: true
            });

            return true;
        } catch (error) {
            return false;
        }
    }

    updateMetadata(data) {
        this.metadata = { ...this.metadata, ...data };
        this.lastUpdateTime = new Date();
    }

    toJSON() {
        return {
            whatsappId: this.whatsappId,
            userPhoneNumber: this.userPhoneNumber,
            messages: this.messages,
            startTime: this.startTime,
            lastUpdateTime: this.lastUpdateTime,
            status: this.status,
            metadata: this.metadata,
            duration: Date.now() - this.startTime,
            messageCount: this.messages.length,
            hasUnprocessedMessages: this.hasUnprocessedMessages
        };
    }
}

module.exports = ConversationBase;