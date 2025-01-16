const { logInfo, logError } = require('../../utils/logger');

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
                const changeResults = await this._processMessages(
                    change.value.messages, 
                    change.value
                );
                this._mergeResults(results, changeResults);
            }
        }

        return results;
    }

    async _processMessages(messages, context) {
        const results = { processed: 0, errors: 0, details: [] };

        for (const message of messages) {
            try {
                const processResult = await this.messageProcessor.processMessage(message, context);
                this._addResult(results, message, 'success', {
                    isFirstInteraction: processResult.isFirstInteraction
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
            isFirstInteraction: extra.isFirstInteraction || false,
            timestamp: new Date()
        });
    }

    _mergeResults(target, source) {
        target.processed += source.processed;
        target.errors += source.errors;
        target.details = target.details.concat(source.details);
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