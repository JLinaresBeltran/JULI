// src/services/conversation/Conversation.js
const { logInfo, logError } = require('../../utils/logger');

class Conversation {
    constructor(whatsappId, userPhoneNumber) {
        this.whatsappId = whatsappId;
        this.userPhoneNumber = userPhoneNumber;
        this.messages = [];
        this.metadata = {};
        this.category = null;
        this.classificationConfidence = null;
        this.createdAt = new Date();
        this.lastUpdateTime = Date.now();
        this.status = 'active';
        this.awaitingClassification = true;
    }

    addMessage(message) {
        try {
            // Validar mensaje
            if (!message || !message.id || !message.timestamp) {
                logError('Invalid message structure', { message });
                return false;
            }

            // Evitar duplicados
            const isDuplicate = this.messages.some(m => m.id === message.id);
            if (isDuplicate) {
                logInfo('Duplicate message detected', { messageId: message.id });
                return false;
            }

            // Procesar mensaje para clasificación si es necesario
            if (this.awaitingClassification && message.type === 'text') {
                this._processForClassification(message);
            }

            // Agregar mensaje
            this.messages.push({
                ...message,
                receivedAt: new Date(),
                processed: true
            });

            // Actualizar timestamp
            this.lastUpdateTime = Date.now();
            
            logInfo('Message added successfully', {
                messageId: message.id,
                conversationId: this.whatsappId,
                totalMessages: this.messages.length
            });
            
            return true;
        } catch (error) {
            logError('Error adding message:', {
                error: error.message,
                messageId: message?.id,
                stack: error.stack
            });
            return false;
        }
    }

    _processForClassification(message) {
        if (!this.category && message.text?.body) {
            this.lastMessageForClassification = message.text.body;
            this.awaitingClassification = true;
            logInfo('Message marked for classification', {
                messageId: message.id,
                text: message.text.body
            });
        }
    }

    getMessages() {
        return [...this.messages];
    }

    getLastMessage() {
        return this.messages[this.messages.length - 1] || null;
    }

    updateMetadata(metadata) {
        try {
            this.metadata = {
                ...this.metadata,
                ...metadata
            };

            if (metadata.category) {
                this.category = metadata.category;
                this.awaitingClassification = false;
                logInfo('Conversation category updated', {
                    whatsappId: this.whatsappId,
                    category: this.category
                });
            }

            if (metadata.classificationConfidence !== undefined) {
                this.classificationConfidence = metadata.classificationConfidence;
            }

            this.lastUpdateTime = Date.now();

            logInfo('Metadata updated successfully', {
                whatsappId: this.whatsappId,
                category: this.category,
                confidence: this.classificationConfidence
            });
        } catch (error) {
            logError('Error updating metadata', {
                error: error.message,
                whatsappId: this.whatsappId,
                stack: error.stack
            });
            throw error;
        }
    }

    isAwaitingClassification() {
        return this.awaitingClassification;
    }

    getMessageForClassification() {
        return this.lastMessageForClassification;
    }

    markAsClassified(category, confidence) {
        this.category = category;
        this.classificationConfidence = confidence;
        this.awaitingClassification = false;
        this.lastMessageForClassification = null;
        this.lastUpdateTime = Date.now();

        logInfo('Conversation marked as classified', {
            whatsappId: this.whatsappId,
            category,
            confidence
        });
    }

    toJSON() {
        return {
            whatsappId: this.whatsappId,
            userPhoneNumber: this.userPhoneNumber,
            messages: this.messages,
            metadata: this.metadata,
            category: this.category,
            classificationConfidence: this.classificationConfidence,
            createdAt: this.createdAt,
            lastUpdateTime: this.lastUpdateTime,
            status: this.status,
            awaitingClassification: this.awaitingClassification
        };
    }
}

module.exports = Conversation;