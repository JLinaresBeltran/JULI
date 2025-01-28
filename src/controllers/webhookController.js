// src/controllers/webhookController.js
const MessageHandler = require('../services/messageHandler');
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const welcomeHandlerService = require('../services/welcomeHandlerService');
const WebSocketManager = require('../services/websocketService');
const legalAgentSystem = require('../services/legalAgents');
const documentService = require('../services/documentService');
const chatbaseController = require('./chatbaseController');
const { logInfo, logError } = require('../utils/logger');

// Configuración de triggers para documentos
const DOCUMENT_TRIGGERS = [
    "juli quiero el documento",
    "quiero el documento",
    "necesito el documento",
    "generar documento",
    "genera el documento",
    "documento por favor"
];

// Crear instancia única del MessageHandler
const messageHandler = new MessageHandler(
    conversationService,
    whatsappService,
    chatbaseController,
    legalAgentSystem,
    documentService
);

function validateWebhookPayload(body) {
    if (!body || !body.object || !Array.isArray(body.entry)) {
        return false;
    }
    return body.object === 'whatsapp_business_account';
}

function validateMessage(message, context) {
    try {
        if (!message || !message.id || !message.from || !message.timestamp) {
            logError('Invalid message structure');
            return false;
        }

        if (!context || !context.metadata || !context.contacts) {
            logError('Invalid message context');
            return false;
        }

        switch (message.type) {
            case 'text':
                if (!message.text?.body) return false;
                break;
            case 'audio':
                if (!message.audio?.id) return false;
                break;
        }

        return /^[0-9]{10,15}$/.test(message.from);
    } catch (error) {
        logError('Message validation error', { error: error.message });
        return false;
    }
}

function isDocumentRequest(text) {
    if (!text) return false;
    const normalizedText = text.toLowerCase().trim();
    return DOCUMENT_TRIGGERS.some(trigger => 
        normalizedText.includes(trigger.toLowerCase())
    );
}

function formatMessage(message, context) {
    try {
        const formattedMessage = {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            direction: 'inbound',
            status: 'received',
            profile: context.contacts[0],
            metadata: {
                displayPhoneNumber: context.metadata.display_phone_number,
                phoneNumberId: context.metadata.phone_number_id
            }
        };

        switch (message.type) {
            case 'text':
                formattedMessage.text = { body: message.text.body };
                formattedMessage.isGreeting = isGreeting(message.text.body);
                formattedMessage.isDocumentRequest = isDocumentRequest(message.text.body);
                break;
            case 'audio':
                formattedMessage.audio = {
                    id: message.audio.id,
                    mimeType: message.audio.mime_type,
                    voice: message.audio.voice || false,
                    duration: message.audio.duration
                };
                break;
            default:
                formattedMessage.content = { type: message.type, raw: message };
        }

        return formattedMessage;
    } catch (error) {
        logError('Message format error', { error: error.message });
        throw error;
    }
}

function isGreeting(text) {
    const greetings = ['hola', 'buenos días', 'buen día', 'buenas', 'buenas tardes', 'buenas noches', 'hi', 'hello'];
    return text && greetings.some(greeting => text.toLowerCase().trim().includes(greeting.toLowerCase()));
}

async function handleDocumentRequest(message, context, conversation) {
    try {
        logInfo('Processing document request', {
            whatsappId: message.from,
            category: conversation?.category || conversation?.metadata?.category
        });

        // Verificar si la conversación está esperando email
        if (conversation?.metadata?.awaitingEmail) {
            const email = message.text.body.trim();
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return await processDocumentGeneration(message, context, conversation, email);
            } else {
                await whatsappService.sendTextMessage(
                    message.from,
                    "El correo electrónico no es válido. Por favor, ingresa un correo válido."
                );
                return { success: true, type: 'INVALID_EMAIL' };
            }
        }

        // Verificar categoría válida
        const category = conversation?.category || conversation?.metadata?.category;
        if (!category || category === 'unknown') {
            await whatsappService.sendTextMessage(
                message.from,
                "Para generar el documento de reclamación, necesito que primero me cuentes tu caso en detalle."
            );
            return { success: false, type: 'NO_CATEGORY' };
        }

        // Solicitar email si no lo tenemos
        await conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                awaitingEmail: true,
                documentRequestPending: true
            }
        );

        await whatsappService.sendTextMessage(
            message.from,
            "Por favor, proporciona tu correo electrónico para enviarte el documento de reclamación."
        );

        return { success: true, type: 'EMAIL_REQUESTED' };

    } catch (error) {
        logError('Error processing document request', {
            error: error.message,
            whatsappId: message.from
        });
        throw error;
    }
}

async function processDocumentGeneration(message, context, conversation, email) {
    try {
        const category = conversation.category || conversation.metadata?.category;
        
        const customerData = {
            name: context.contacts?.[0]?.profile?.name || 'Usuario',
            documentNumber: conversation.metadata?.documentNumber,
            email: email,
            phone: message.from,
            address: conversation.metadata?.address || "No especificado",
            ...getServiceSpecificData(conversation)
        };

        const result = await legalAgentSystem.processComplaint(
            category,
            conversation.getMessages(),
            customerData
        );

        await documentService.generateDocument(
            category,
            result,
            customerData
        );

        await conversationService.updateConversationMetadata(
            conversation.whatsappId,
            {
                email: email,
                awaitingEmail: false,
                documentGenerated: true,
                documentGeneratedTimestamp: new Date().toISOString(),
                documentRequestPending: false
            }
        );

        await whatsappService.sendTextMessage(
            message.from,
            "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
        );

        return { success: true, type: 'DOCUMENT_GENERATED' };

    } catch (error) {
        logError('Error generating document', {
            error: error.message,
            whatsappId: message.from
        });
        
        await whatsappService.sendTextMessage(
            message.from,
            "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
        );
        
        throw error;
    }
}

function getServiceSpecificData(conversation) {
    const metadata = conversation.metadata || {};
    const category = conversation.category || metadata.category;

    const dataMap = {
        'servicios_publicos': {
            cuenta_contrato: metadata.accountNumber,
            tipo_servicio: metadata.serviceType,
            periodo_facturacion: metadata.billingPeriod
        },
        'telecomunicaciones': {
            numero_linea: metadata.lineNumber,
            plan_contratado: metadata.plan,
            fecha_contratacion: metadata.contractDate
        },
        'transporte_aereo': {
            numero_reserva: metadata.reservationNumber,
            numero_vuelo: metadata.flightNumber,
            fecha_vuelo: metadata.flightDate,
            ruta: metadata.route,
            valor_tiquete: metadata.ticketValue
        }
    };

    return dataMap[category] || {};
}

const webhookController = {
    async receiveMessage(req, res) {
        try {
            logInfo('API Request: POST /webhook', {
                headers: req.headers['x-forwarded-for'] || req.ip,
                timestamp: new Date().toLocaleTimeString()
            });

            if (!validateWebhookPayload(req.body)) {
                throw new Error('Invalid webhook payload');
            }

            const results = { processed: 0, errors: 0, details: [] };

            for (const entry of req.body.entry) {
                for (const change of entry.changes) {
                    try {
                        // Detectar inicio de conversación por sistema
                        if (this._isSystemConversationStart(change)) {
                            const userId = change.value.contacts[0].wa_id;
                            await this._handleNewUserWelcome(userId, change.value);
                            results.processed++;
                            continue;
                        }

                        // Procesar mensajes
                        if (change.value?.messages?.length > 0) {
                            const message = change.value.messages[0];
                            const context = {
                                metadata: change.value.metadata,
                                contacts: change.value.contacts
                            };

                            // Validar mensaje
                            if (!validateMessage(message, context)) {
                                throw new Error('Invalid message format');
                            }

                            // Detectar si es primer mensaje de una nueva conversación
                            const isNewConversation = !(await conversationService.getConversation(message.from));
                            if (isNewConversation) {
                                logInfo('Nueva conversación detectada por primer mensaje', {
                                    userId: message.from
                                });
                                await this._handleNewUserWelcome(message.from, change.value);
                            }

                            const conversation = await conversationService.getConversation(message.from);

                            // Verificar si es una solicitud de documento
                            if (message.type === 'text' && isDocumentRequest(message.text.body)) {
                                const documentResult = await handleDocumentRequest(message, context, conversation);
                                this._addResult(results, message, 'success', documentResult);
                                continue;
                            }

                            // Procesar mensaje normal
                            const result = await messageHandler.processMessage(message, context);
                            this._broadcastUpdates(conversation);
                            this._addResult(results, message, 'success', result);
                        }
                    } catch (error) {
                        logError('Error processing change', { error: error.message });
                        if (change.value?.messages?.[0]) {
                            this._addResult(results, change.value.messages[0], 'error', { error });
                        }
                    }
                }
            }

            logInfo('Webhook processed', { results });
            return res.status(200).send('EVENT_RECEIVED');

        } catch (error) {
            logError('Webhook error', { error });
            return res.status(200).send('EVENT_RECEIVED');
        }
    },

    _isSystemConversationStart(change) {
        return (
            change.field === "messages" &&
            change.value?.contacts?.[0] &&
            !change.value.messages &&
            !!change.value?.contacts?.[0]?.wa_id &&
            change.value?.event === 'system_customer_welcome'
        );
    },

    async _handleNewUserWelcome(userId, context) {
        try {
            logInfo('Iniciando manejo de nuevo usuario', {
                userId,
                contextType: context?.event || 'message'
            });

            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';
            let conversation = await conversationService.getConversation(userId);
            
            if (!conversation) {
                conversation = await conversationService.createConversation(userId, userId);
                logInfo('Nueva conversación creada', {
                    whatsappId: userId,
                    userPhoneNumber: userId,
                    context: 'createConversation'
                });

                await welcomeHandlerService.handleInitialInteraction(userId, userName, {
                    ...context,
                    conversation: {
                        id: userId,
                        isNew: true
                    }
                });

                this._broadcastUpdates(conversation);
            }

            return conversation;
        } catch (error) {
            logError('Welcome flow error', { error: error.message });
            throw error;
        }
    },

    _addResult(results, message, status, details) {
        results[status === 'success' ? 'processed' : 'errors']++;
        results.details.push({
            id: message.id,
            status,
            type: message.type,
            ...details
        });
    },

    _broadcastUpdates(conversation) {
        const wsManager = WebSocketManager.getInstance();
        if (wsManager) {
            wsManager.broadcastConversationUpdate(conversation);
            wsManager.broadcastConversations();
        }
    },

    async getConversations(req, res) {
        try {
            const conversations = await conversationService.getAllConversations();
            return res.status(200).json(conversations);
        } catch (error) {
            logError('Conversations retrieval error', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    },

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            return res.status(200).json(analytics);
        } catch (error) {
            logError('Analytics error', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = webhookController;