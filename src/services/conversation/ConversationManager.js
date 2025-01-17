// src/services/conversation/ConversationManager.js
const { logInfo, logError } = require('../../utils/logger');

class ConversationManager {
    constructor() {
        this.conversations = new Map();
    }

    create(whatsappId, userPhoneNumber) {
        try {
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
                status: 'active',
                awaitingClassification: true,
    
                // Métodos del objeto conversation
                addMessage(message) {
                    try {
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
    
                        // Agregar mensaje
                        this.messages.push({
                            ...message,
                            receivedAt: new Date()
                        });
    
                        // Actualizar timestamp
                        this.lastUpdateTime = Date.now();
                        
                        logInfo('Message added successfully', {
                            messageId: message.id,
                            conversationId: this.whatsappId
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
                },
    
                getMessages() {
                    return [...this.messages];
                },
    
                updateMetadata(metadata) {
                    try {
                        this.metadata = {
                            ...this.metadata,
                            ...metadata
                        };
    
                        if (metadata.category) {
                            this.category = metadata.category;
                            this.awaitingClassification = false;
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
                    }
                },
    
                // Agregar el método isAwaitingClassification
                isAwaitingClassification() {
                    return this.awaitingClassification;
                },
    
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
            };
    
            this.conversations.set(whatsappId, conversation);
            
            logInfo('New conversation created', {
                whatsappId,
                userPhoneNumber
            });
    
            return conversation;
        } catch (error) {
            logError('Error creating conversation', {
                error: error.message,
                whatsappId,
                userPhoneNumber,
                stack: error.stack
            });
            throw error;
        }
    }

    get(whatsappId) {
        try {
            return this.conversations.get(whatsappId);
        } catch (error) {
            logError('Error getting conversation', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
            return null;
        }
    }

    update(whatsappId, updates) {
        try {
            const conversation = this.conversations.get(whatsappId);
            if (!conversation) return false;

            Object.assign(conversation, updates);
            conversation.lastUpdateTime = Date.now();

            logInfo('Conversation updated', {
                whatsappId,
                updates: Object.keys(updates)
            });

            return true;
        } catch (error) {
            logError('Error updating conversation', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
            return false;
        }
    }

    delete(whatsappId) {
        try {
            const result = this.conversations.delete(whatsappId);
            
            logInfo('Conversation deleted', {
                whatsappId,
                success: result
            });

            return result;
        } catch (error) {
            logError('Error deleting conversation', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
            return false;
        }
    }

    getAll() {
        try {
            return Array.from(this.conversations.values());
        } catch (error) {
            logError('Error getting all conversations', {
                error: error.message,
                stack: error.stack
            });
            return [];
        }
    }

    getCount() {
        try {
            return this.conversations.size;
        } catch (error) {
            logError('Error getting conversation count', {
                error: error.message,
                stack: error.stack
            });
            return 0;
        }
    }

    updateMetadata(whatsappId, metadata) {
        try {
            const conversation = this.conversations.get(whatsappId);
            if (!conversation) {
                logInfo('Conversation not found for metadata update', { whatsappId });
                return false;
            }

            conversation.updateMetadata(metadata);
            
            logInfo('Metadata updated', {
                whatsappId,
                metadata: Object.keys(metadata)
            });

            return true;
        } catch (error) {
            logError('Error updating conversation metadata', {
                error: error.message,
                whatsappId,
                stack: error.stack
            });
            return false;
        }
    }
}

module.exports = ConversationManager;