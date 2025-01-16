const { logInfo, logError } = require('../../utils/logger');
const welcomeHandlerService = require('../welcomeHandlerService');
const WebhookValidator = require('./WebhookValidator');

class WebhookProcessor {
    constructor(messageProcessor, wsManager) {
        this.messageProcessor = messageProcessor;
        this.wsManager = wsManager;
    }

    async processWebhook(body) {
        const results = {
            processed: 0,
            errors: 0,
            details: []
        };

        WebhookValidator.validatePayload(body);

        for (const entry of body.entry) {
            const entryResults = await this._processEntry(entry);
            this._mergeResults(results, entryResults);
        }

        this._notifyProcessingSummary(results);
        return results;
    }

    async _processEntry(entry) {
        const results = { processed: 0, errors: 0, details: [] };
        
        for (const change of entry.changes) {
            if (change.value.messages) {
                const isFirstInteraction = await this._checkFirstInteraction(
                    change.value.messages[0]?.from,
                    change.value
                );

                if (isFirstInteraction) {
                    await this._handleFirstInteraction(change.value);
                }

                const changeResults = await this._processMessages(
                    change.value.messages, 
                    change.value
                );
                this._mergeResults(results, changeResults);
            }
        }

        return results;
    }

    async _checkFirstInteraction(userId, context) {
        if (!userId) return false;
        try {
            const conversation = await this.messageProcessor.getConversation(userId);
            return !conversation;
        } catch (error) {
            logError('Error checking first interaction', { error, userId });
            return false;
        }
    }

    async _handleFirstInteraction(context) {
        try {
            const userId = context.messages[0].from;
            const userName = context.contacts?.[0]?.profile?.name || 'Usuario';

            logInfo('Processing first interaction', { userId, userName });

            await welcomeHandlerService.handleInitialInteraction(userId, userName);

            // Notificar por WebSocket
            this.wsManager.broadcast({
                type: 'newConversation',
                data: {
                    userId,
                    timestamp: new Date(),
                    userName
                }
            });

        } catch (error) {
            logError('Error handling first interaction', { error });
        }
    }

    async _processMessages(messages, context) {
        const results = { processed: 0, errors: 0, details: [] };

        for (const message of messages) {
            try {
                await this.messageProcessor.processMessage(message, context);
                this._addResult(results, message, 'success', {
                    isGreeting: this._isGreeting(message)
                });
            } catch (error) {
                this._addResult(results, message, 'error', error);
                logError('Message processing failed', {
                    error,
                    messageId: message.id,
                    context: {
                        type: message.type,
                        from: message.from
                    }
                });
            }
        }

        return results;
    }

    _isGreeting(message) {
        if (message.type !== 'text') return false;
        const greetings = ['hola', 'buenos días', 'buen día', 'buenas', 'hi', 'hello'];
        return message.text?.body && greetings.some(greeting => 
            message.text.body.toLowerCase().includes(greeting.toLowerCase())
        );
    }

    _mergeResults(target, source) {
        target.processed += source.processed;
        target.errors += source.errors;
        target.details = target.details.concat(source.details);
    }

    _addResult(results, message, status, extra = {}) {
        if (status === 'success') {
            results.processed++;
        } else {
            results.errors++;
        }

        results.details.push({
            id: message.id,
            status,
            type: message.type,
            error: extra.error?.message,
            isGreeting: extra.isGreeting || false,
            timestamp: new Date()
        });
    }

    _notifyProcessingSummary(results) {
        this.wsManager.broadcast({
            type: 'webhookProcessingSummary',
            data: {
                totalMessages: results.processed + results.errors,
                processedMessages: results.processed,
                failedMessages: results.errors,
                timestamp: new Date()
            }
        });
    }
}

module.exports = WebhookProcessor;