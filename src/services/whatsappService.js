const axios = require('axios');
const { logInfo, logError } = require('../utils/logger');

class WhatsAppService {
    constructor() {
        this.apiVersion = 'v17.0';
        this.baseUrl = 'https://graph.facebook.com';
        this.accessToken = process.env.ACCESS_TOKEN;
        this.phoneNumberId = process.env.PHONE_NUMBER_ID;
        this.accountId = process.env.WHATSAPP_ACCOUNT_ID;

        if (!this.accessToken || !this.phoneNumberId || !this.accountId) {
            throw new Error('WhatsApp credentials not properly configured');
        }

        logInfo('WhatsApp service initialized with:', {
            configuredPhoneNumberId: this.phoneNumberId,
            configuredAccountId: this.accountId,
            hasAccessToken: !!this.accessToken,
            apiVersion: this.apiVersion
        });
    }

    async sendMessage(to, content, phoneNumberId = null) {
        try {
            // Usar el ID del teléfono recibido si está disponible
            const usePhoneNumberId = phoneNumberId || this.phoneNumberId;
            const url = `${this.baseUrl}/${this.apiVersion}/${usePhoneNumberId}/messages`;
            
            logInfo('Attempting to send message', {
                to,
                usingPhoneNumberId: usePhoneNumberId,
                configuredPhoneNumberId: this.phoneNumberId,
                messageType: content.type
            });

            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                ...content
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            logInfo('Message sent successfully', {
                to,
                messageId: response.data.messages?.[0]?.id,
                phoneNumberId: usePhoneNumberId
            });

            return response.data;
        } catch (error) {
            logError('Failed to send WhatsApp message', {
                error: error.message,
                to,
                phoneNumberId: phoneNumberId || this.phoneNumberId,
                responseData: error.response?.data,
                errorStatus: error.response?.status
            });
            throw error;
        }
    }

    async sendTextMessage(to, text, phoneNumberId = null) {
        return this.sendMessage(to, {
            type: 'text',
            text: { body: text }
        }, phoneNumberId);
    }

    async sendTemplateMessage(to, templateName, languageCode = 'es', components = [], phoneNumberId = null) {
        return this.sendMessage(to, {
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode },
                components
            }
        }, phoneNumberId);
    }

    async sendWelcomeMessage(to, userName, phoneNumberId = null) {
        try {
            logInfo('Sending welcome message', {
                to,
                userName,
                phoneNumberId: phoneNumberId || this.phoneNumberId
            });

            const welcomeMessage = {
                type: 'text',
                text: {
                    body: `¡Hola ${userName}! 👋\n\n` +
                          `Soy JULI, tu asistente legal virtual personalizada ✨\n\n` +
                          `Me especializo en brindarte orientación sobre:\n` +
                          `🏠 Servicios públicos\n` +
                          `📱 Telecomunicaciones\n` +
                          `✈️ Transporte aéreo\n\n` +
                          `Cuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`
                },
                preview_url: false
            };

            const response = await this.sendMessage(to, welcomeMessage, phoneNumberId);

            logInfo('Welcome message sent successfully', {
                to,
                userName,
                messageId: response.messages?.[0]?.id
            });

            return response;
        } catch (error) {
            logError('Failed to send welcome message', {
                error: error.message,
                to,
                userName,
                phoneNumberId: phoneNumberId || this.phoneNumberId,
                stack: error.stack
            });
            throw error;
        }
    }

    async markAsRead(messageId, receivedPhoneNumberId = null) {
        try {
            // Si el ID del teléfono recibido es diferente del configurado, loggearlo
            if (receivedPhoneNumberId && receivedPhoneNumberId !== this.phoneNumberId) {
                logInfo('Phone number ID mismatch in markAsRead', {
                    configured: this.phoneNumberId,
                    received: receivedPhoneNumberId,
                    messageId
                });
            }

            // Usar el ID del teléfono recibido si está disponible
            const usePhoneNumberId = receivedPhoneNumberId || this.phoneNumberId;
            const url = `${this.baseUrl}/${this.apiVersion}/${usePhoneNumberId}/messages`;

            logInfo('Attempting to mark message as read', {
                messageId,
                usingPhoneNumberId: usePhoneNumberId,
                configuredPhoneNumberId: this.phoneNumberId
            });

            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            logInfo('Message marked as read successfully', { 
                messageId,
                phoneNumberId: usePhoneNumberId,
                response: response.data 
            });

            return response.data;
        } catch (error) {
            logError('Failed to mark message as read', {
                error: error.message,
                messageId,
                phoneNumberId: receivedPhoneNumberId || this.phoneNumberId,
                errorDetails: error.response?.data,
                errorStatus: error.response?.status,
                stack: error.stack
            });
            throw error;
        }
    }
}

// Exportar una única instancia
const whatsappService = new WhatsAppService();
module.exports = whatsappService;