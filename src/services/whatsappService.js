const axios = require('axios');
const FormData = require('form-data');
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

    async downloadMedia(mediaId) {
        try {
            logInfo('Iniciando descarga de medio', { mediaId });
            
            if (!mediaId) {
                throw new Error('Media ID es requerido');
            }
    
            // Obtener la URL del medio
            const mediaUrl = `${this.baseUrl}/${this.apiVersion}/${mediaId}`;
            
            logInfo('Obteniendo información del medio', { mediaUrl });
            
            const mediaInfoResponse = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
    
            if (!mediaInfoResponse.data?.url) {
                throw new Error('No se pudo obtener URL de descarga del medio');
            }
    
            logInfo('URL de medio obtenida, iniciando descarga');
    
            // Descargar el contenido del medio con retry
            const maxRetries = 3;
            let lastError = null;
    
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const downloadResponse = await axios.get(mediaInfoResponse.data.url, {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`
                        },
                        responseType: 'arraybuffer',
                        timeout: 10000 // 10 segundos timeout
                    });
    
                    logInfo('Medio descargado exitosamente', { 
                        mediaId,
                        size: downloadResponse.data.length,
                        attempt
                    });
    
                    return Buffer.from(downloadResponse.data);
                    
                } catch (error) {
                    lastError = error;
                    logError('Error en intento de descarga', {
                        attempt,
                        mediaId,
                        error: error.message
                    });
    
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                    }
                }
            }
    
            throw lastError || new Error('No se pudo descargar el medio después de múltiples intentos');
    
        } catch (error) {
            logError('Error en descarga de medio', {
                error: error.message,
                mediaId,
                responseData: error.response?.data,
                errorStatus: error.response?.status
            });
            throw error;
        }
    }

    async sendVoiceMessage(to, audioBuffer, phoneNumberId = null) {
        try {
            logInfo('Preparing to send voice message', {
                to,
                bufferSize: audioBuffer.length,
                phoneNumberId: phoneNumberId || this.phoneNumberId
            });

            // Subir el audio a WhatsApp
            const usePhoneNumberId = phoneNumberId || this.phoneNumberId;
            const uploadUrl = `${this.baseUrl}/${this.apiVersion}/${usePhoneNumberId}/media`;
            
            const formData = new FormData();
            formData.append('file', audioBuffer, {
                filename: 'audio.mp3',
                contentType: 'audio/mp3'
            });
            formData.append('messaging_product', 'whatsapp');
            formData.append('type', 'audio/mp3');

            const uploadResponse = await axios.post(uploadUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            logInfo('Audio uploaded successfully', {
                mediaId: uploadResponse.data.id
            });

            // Enviar el mensaje de audio
            return this.sendMessage(to, {
                type: 'audio',
                audio: { id: uploadResponse.data.id }
            }, phoneNumberId);

        } catch (error) {
            logError('Failed to send voice message', {
                error: error.message,
                to,
                phoneNumberId: phoneNumberId || this.phoneNumberId,
                responseData: error.response?.data,
                errorStatus: error.response?.status
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