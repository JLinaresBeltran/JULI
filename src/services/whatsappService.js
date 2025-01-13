// src/services/whatsappService.js
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
            phoneNumberId: this.phoneNumberId,
            accountId: this.accountId,
            hasAccessToken: !!this.accessToken
        });
    }

    async sendMessage(to, content) {
        try {
            const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
            
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
                messageId: response.data.messages?.[0]?.id
            });

            return response.data;
        } catch (error) {
            logError('Failed to send WhatsApp message', {
                error: error.message,
                to,
                responseData: error.response?.data
            });
            throw error;
        }
    }

    async sendTextMessage(to, text) {
        return this.sendMessage(to, {
            type: 'text',
            text: { body: text }
        });
    }

    async sendTemplateMessage(to, templateName, languageCode = 'es', components = []) {
        return this.sendMessage(to, {
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode },
                components
            }
        });
    }

    async markAsRead(messageId) {
        try {
            const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
            
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

            logInfo('Message marked as read', { messageId });
            return response.data;
        } catch (error) {
            logError('Failed to mark message as read', {
                error: error.message,
                messageId
            });
            throw error;
        }
    }
}

// Exportar una única instancia
const whatsappService = new WhatsAppService();
module.exports = whatsappService;