// src/controllers/chatbaseController.js
const crypto = require('crypto');
const axios = require('axios');
const { getChatbaseConfig } = require('../config/chatbase');
const { logInfo, logError } = require('../utils/logger');
const conversationService = require('../services/conversationService');
const whatsappService = require('../services/whatsappService');
const legalAgentSystem = require('../services/legalAgents');
const documentService = require('../services/documentService');

class ChatbaseController {
    constructor() {
        // Mapeo de chatbotIds a categorías
        this.chatbotCategories = {
            [process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID]: 'servicios_publicos',
            [process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID]: 'telecomunicaciones',
            [process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID]: 'transporte_aereo'
        };

        // Mapeo de chatbotIds a sus respectivas claves secretas
        this.secretKeys = {
            [process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID]: process.env.CHATBASE_SECRET_KEY_SERVICIOS_PUBLICOS,
            [process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID]: process.env.CHATBASE_SECRET_KEY_TELECOMUNICACIONES,
            [process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID]: process.env.CHATBASE_SECRET_KEY_TRANSPORTE_AEREO
        };
    }

    // Método base para enviar mensajes a Chatbase
    async sendChatbaseMessage(serviceName, userMessage) {
        try {
            const config = getChatbaseConfig(serviceName);

            if (!userMessage || typeof userMessage !== 'string') {
                throw new Error('Invalid user message provided.');
            }

            const payload = {
                messages: [{ content: userMessage, role: 'user' }],
                chatbotId: config.chatbotId,
                conversationId: `conversation-${serviceName}-${Date.now()}`
            };

            logInfo('Sending message to Chatbase', {
                service: serviceName,
                payload: payload
            });

            const response = await axios.post(`${config.endpoint}/chat`, payload, {
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            logInfo('Chatbase response received', {
                service: serviceName,
                status: response.status
            });

            return response.data;
        } catch (error) {
            logError('Error sending message to Chatbase', {
                error: error.message,
                serviceName,
                responseError: error.response?.data,
                status: error.response?.status
            });

            return {
                text: 'En este momento no puedo procesar tu solicitud. Por favor, intenta nuevamente más tarde.'
            };
        }
    }

    // Handlers específicos por servicio
    async handleServiciosPublicos(message) {
        return await this.sendChatbaseMessage('servicios_publicos', message);
    }

    async handleTelecomunicaciones(message) {
        return await this.sendChatbaseMessage('telecomunicaciones', message);
    }

    async handleTransporteAereo(message) {
        return await this.sendChatbaseMessage('transporte_aereo', message);
    }

    // Manejo de Webhooks
    async handleWebhook(req, res) {
        try {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const { eventType, chatbotId, payload } = req.body;

            if (!this.chatbotCategories[chatbotId]) {
                logError('Invalid chatbot ID', { chatbotId });
                return res.status(400).json({ error: 'Invalid chatbot ID' });
            }

            if (!this.verifySignature(req, chatbotId)) {
                return res.status(400).json({ error: 'Invalid signature' });
            }

            if (eventType === 'leads.submit') {
                await this.handleLeadSubmission(payload, chatbotId);
                return res.status(200).json({ message: 'Lead processed successfully' });
            }

            return res.status(200).json({ message: 'Event received' });

        } catch (error) {
            logError('Error in Chatbase webhook', { error: error.message });
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    verifySignature(req, chatbotId) {
        try {
            const signature = req.headers['x-chatbase-signature'];
            if (!signature) return false;

            const secretKey = this.secretKeys[chatbotId];
            if (!secretKey) {
                throw new Error(`No secret key found for chatbot: ${chatbotId}`);
            }

            const rawBody = JSON.stringify(req.body);
            const computedSignature = crypto
                .createHmac('sha1', secretKey)
                .update(Buffer.from(rawBody))
                .digest('hex');

            logInfo('Verifying signature for chatbot', { 
                chatbotId,
                category: this.chatbotCategories[chatbotId],
                signatureMatch: computedSignature === signature 
            });

            return computedSignature === signature;
        } catch (error) {
            logError('Signature verification error', { error: error.message });
            return false;
        }
    }

    async handleLeadSubmission(payload, chatbotId) {
        const { conversationId, customerEmail, customerName, customerPhone } = payload;
        const category = this.chatbotCategories[chatbotId];

        try {
            const conversation = await conversationService.getConversation(customerPhone);
            if (!conversation) {
                throw new Error(`Conversation not found for phone: ${customerPhone}`);
            }

            logInfo('Processing legal document generation', {
                email: customerEmail,
                category,
                chatbotId
            });

            await conversationService.updateConversationMetadata(
                conversation.whatsappId,
                {
                    email: customerEmail,
                    customerName: customerName,
                    processingDocument: true,
                    category
                }
            );

            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "Estamos procesando tu solicitud para generar el documento legal..."
            );

            const customerData = {
                name: customerName,
                documentNumber: conversation.metadata?.documentNumber,
                email: customerEmail,
                phone: customerPhone,
                address: conversation.metadata?.address || "No especificado",
                ...this.getServiceSpecificData(conversation)
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

            await whatsappService.sendTextMessage(
                conversation.whatsappId,
                "¡Tu documento ha sido generado y enviado a tu correo electrónico!"
            );

            await conversationService.updateConversationMetadata(
                conversation.whatsappId,
                { processingDocument: false }
            );

        } catch (error) {
            logError('Error processing lead submission', { 
                error: error.message,
                category,
                chatbotId 
            });
            
            if (customerPhone) {
                await whatsappService.sendTextMessage(
                    customerPhone,
                    "Lo sentimos, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
                );
            }
            
            throw error;
        }
    }

    getServiceSpecificData(conversation) {
        switch(conversation.category) {
            case 'servicios_publicos':
                return {
                    cuenta_contrato: conversation.metadata?.accountNumber,
                    tipo_servicio: conversation.metadata?.serviceType,
                    periodo_facturacion: conversation.metadata?.billingPeriod
                };
            case 'telecomunicaciones':
                return {
                    numero_linea: conversation.metadata?.lineNumber,
                    plan_contratado: conversation.metadata?.plan,
                    fecha_contratacion: conversation.metadata?.contractDate
                };
            case 'transporte_aereo':
                return {
                    numero_reserva: conversation.metadata?.reservationNumber,
                    numero_vuelo: conversation.metadata?.flightNumber,
                    fecha_vuelo: conversation.metadata?.flightDate,
                    ruta: conversation.metadata?.route,
                    valor_tiquete: conversation.metadata?.ticketValue
                };
            default:
                return {};
        }
    }
}

// Crear una instancia única del controlador
const chatbaseController = new ChatbaseController();

// Exportar los métodos necesarios
module.exports = {
    handleServiciosPublicos: (message) => chatbaseController.handleServiciosPublicos(message),
    handleTelecomunicaciones: (message) => chatbaseController.handleTelecomunicaciones(message),
    handleTransporteAereo: (message) => chatbaseController.handleTransporteAereo(message),
    handleWebhook: (req, res) => chatbaseController.handleWebhook(req, res),
    // Exportar función principal para tests
    sendChatbaseMessage: (serviceName, message) => chatbaseController.sendChatbaseMessage(serviceName, message)
};