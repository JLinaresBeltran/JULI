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

        // Procesar eventos de inicio de sesión
        if (this._isSessionStartEvent(body)) {
            await this._handleSessionStart(body);
        }

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
            // Procesar estados primero
            if (change.value.statuses) {
                const statusResults = await this._processStatuses(
                    change.value.statuses,
                    change.value
                );
                this._mergeResults(results, statusResults);
            }

            // Luego procesar mensajes
            if (change.value.messages) {
                const messageResults = await this._processMessages(
                    change.value.messages, 
                    change.value
                );
                this._mergeResults(results, messageResults);
            }
        }

        return results;
    }

    async _processMessages(messages, context) {
        const results = { processed: 0, errors: 0, details: [] };

        for (const message of messages) {
            try {
                await this.messageProcessor.processMessage(message, context);
                this._addResult(results, message, 'success');
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

    async _processStatuses(statuses, context) {
        const results = { processed: 0, errors: 0, details: [] };

        for (const status of statuses) {
            try {
                // Detectar inicio de conversación
                if (this._isConversationStart(status)) {
                    await this._handleNewConversation(status, context);
                }

                this._addStatusResult(results, status, 'success');
            } catch (error) {
                this._addStatusResult(results, status, 'error', error);
                logError('Status processing failed', {
                    error,
                    statusId: status.id,
                    context: {
                        status: status.status,
                        recipient: status.recipient_id
                    }
                });
            }
        }

        return results;
    }

    _isSessionStartEvent(body) {
        return body.entry?.some(entry => 
            entry.changes?.some(change => 
                change.value?.statuses?.some(status => 
                    this._isConversationStart(status)
                )
            )
        );
    }

    _isConversationStart(status) {
        return (status.status === 'sent' || status.status === 'delivered') && 
               status.conversation?.origin?.type === 'user_initiated';
    }

    async _handleSessionStart(body) {
        try {
            const entry = body.entry[0];
            const change = entry.changes[0];
            const status = change.value.statuses[0];
            
            await this._handleNewConversation(status, change.value);
        } catch (error) {
            logError('Error handling session start', { error });
        }
    }

    async _handleNewConversation(status, context) {
        const userId = status.recipient_id;
        
        try {
            // Verificar si ya existe una conversación
            const conversation = await this.messageProcessor.getConversation(userId);
            
            if (!conversation) {
                logInfo('New conversation detected', { 
                    userId,
                    statusType: status.status,
                    origin: status.conversation?.origin?.type
                });

                // Enviar mensaje de bienvenida
                await welcomeHandlerService.handleInitialInteraction(
                    userId,
                    context.contacts?.[0]?.profile?.name || 'Usuario'
                );

                // Notificar al WebSocket
                this.wsManager.broadcast({
                    type: 'newConversation',
                    data: {
                        userId,
                        timestamp: new Date(),
                        type: 'welcome'
                    }
                });
            }
        } catch (error) {
            logError('Error handling new conversation', {
                error,
                userId,
                context
            });
            throw error;
        }
    }

    _mergeResults(target, source) {
        target.processed += source.processed;
        target.errors += source.errors;
        target.details = target.details.concat(source.details);
    }

    _addResult(results, message, status, error = null) {
        if (status === 'success') {
            results.processed++;
        } else {
            results.errors++;
        }

        results.details.push({
            id: message.id,
            status,
            type: message.type,
            error: error?.message,
            timestamp: new Date()
        });
    }

    _addStatusResult(results, status, result, error = null) {
        if (result === 'success') {
            results.processed++;
        } else {
            results.errors++;
        }

        results.details.push({
            id: status.id,
            status: result,
            type: 'status',
            statusValue: status.status,
            error: error?.message,
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