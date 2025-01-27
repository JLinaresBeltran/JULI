const { logInfo, logError } = require('../../utils/logger');
const MessageProcessor = require('./MessageProcessor');

class WebhookProcessor {
    constructor(conversationService, whatsappService, wsManager, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.wsManager = wsManager;
        this.messageProcessor = new MessageProcessor(
            conversationService,
            whatsappService,
            wsManager,
            legalAgentSystem,
            documentService
        );
        this.documentRequestKey = "juli quiero el documento";
    }

    async processWebhook(body) {
        if (!this._validateWebhookPayload(body)) {
            throw new Error('Invalid webhook payload');
        }

        const results = { processed: 0, errors: 0, details: [] };

        for (const entry of body.entry) {
            for (const change of entry.changes) {
                if (!change.value?.messages) continue;

                const message = change.value.messages[0];
                const context = {
                    metadata: change.value.metadata,
                    contacts: change.value.contacts
                };

                await this._processIncomingMessage(message, context, results);
            }
        }

        return results;
    }

    async _processIncomingMessage(message, context, results) {
        try {
            logInfo('Processing incoming message', {
                type: message.type,
                from: message.from
            });

            // Solo procesar mensajes de texto
            if (message.type !== 'text') {
                return await this._processNormalFlow(message, context, results);
            }

            const normalizedMessage = message.text.body.toLowerCase().trim();
            const conversation = await this.conversationService.getConversation(message.from);

            // 1. Verificar solicitud de documento
            if (normalizedMessage === this.documentRequestKey) {
                logInfo('Document request detected', {
                    whatsappId: message.from
                });

                if (!conversation?.category || conversation.category === 'unknown') {
                    await this.whatsappService.sendTextMessage(
                        message.from,
                        "Por favor, cuéntame primero tu caso para poder ayudarte con el documento adecuado."
                    );
                    this._addResult(results, message, 'success', { documentRequest: true });
                    return;
                }

                await this.conversationService.updateConversationMetadata(
                    message.from,
                    {
                        awaitingEmail: true,
                        emailRequestTimestamp: new Date().toISOString(),
                        documentRequestPending: true
                    }
                );

                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
                );

                this._addResult(results, message, 'success', { documentRequest: true });
                return;
            }

            // 2. Verificar espera de email
            if (conversation?.metadata?.awaitingEmail) {
                if (this._isValidEmail(normalizedMessage)) {
                    logInfo('Valid email received', {
                        email: normalizedMessage,
                        whatsappId: message.from
                    });

                    await this._handleEmailSubmission(message, conversation, context);
                    this._addResult(results, message, 'success', { emailSubmission: true });
                } else {
                    await this.whatsappService.sendTextMessage(
                        message.from,
                        "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                    );
                    this._addResult(results, message, 'success', { invalidEmail: true });
                }
                return;
            }

            // 3. Procesar como mensaje normal
            await this._processNormalFlow(message, context, results);

        } catch (error) {
            logError('Error processing message', { error });
            this._addResult(results, message, 'error', { error });
        }
    }

    async _processNormalFlow(message, context, results) {
        try {
            const processResult = await this.messageProcessor.processMessage(message, context);
            this._addResult(results, message, 'success', {
                isFirstInteraction: processResult.isFirstInteraction
            });
        } catch (error) {
            this._addResult(results, message, 'error', { error });
            logError('Message processing failed', {
                error,
                messageId: message.id,
                context: { type: message.type, from: message.from }
            });
        }
    }

    async _handleEmailSubmission(message, conversation, context) {
        const email = message.text.body.trim();

        try {
            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    email: email,
                    awaitingEmail: false,
                    processingDocument: true
                }
            );

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estamos procesando tu solicitud para generar el documento legal..."
            );

            const customerData = {
                name: context.contacts?.[0]?.profile?.name || 'Usuario',
                documentNumber: conversation.metadata?.documentNumber,
                email: email,
                phone: message.from,
                address: conversation.metadata?.address || "No especificado",
                ...this._getServiceSpecificData(conversation)
            };

            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            await this.documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );

            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            await this.conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    processingDocument: false,
                    documentGenerated: true,
                    documentGeneratedTimestamp: new Date().toISOString()
                }
            );

        } catch (error) {
            logError('Error processing document', { error });
            await this.whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );
            throw error;
        }
    }

    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    _getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.reservationNumber || "N/A",
                    numero_vuelo: conversation.metadata?.flightNumber || "N/A",
                    fecha_vuelo: conversation.metadata?.flightDate || new Date().toISOString().split('T')[0],
                    ruta: conversation.metadata?.route || "N/A",
                    valor_tiquete: conversation.metadata?.ticketValue || "0"
                };
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.accountNumber || "N/A",
                    tipo_servicio: conversation.metadata?.serviceType || "N/A",
                    periodo_facturacion: conversation.metadata?.billingPeriod || "N/A"
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.lineNumber || "N/A",
                    plan_contratado: conversation.metadata?.plan || "N/A",
                    fecha_contratacion: conversation.metadata?.contractDate || "N/A"
                };
            default:
                return {};
        }
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
            documentRequest: extra.documentRequest || false,
            emailSubmission: extra.emailSubmission || false,
            invalidEmail: extra.invalidEmail || false,
            timestamp: new Date()
        });
    }

    _validateWebhookPayload(body) {
        return body && 
               body.object === 'whatsapp_business_account' && 
               Array.isArray(body.entry);
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