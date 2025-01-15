// src/services/webhook/WebhookValidator.js
class WebhookValidator {
    static validatePayload(body) {
        if (!body?.object) {
            throw new Error('Invalid payload structure');
        }
        if (body.object !== 'whatsapp_business_account') {
            throw new Error('Unexpected webhook object type');
        }
        if (!Array.isArray(body.entry)) {
            throw new Error('Invalid entry structure');
        }
        return true;
    }

    static validateVerification(mode, token, challenge, verifyToken) {
        return mode === 'subscribe' && token === verifyToken ? challenge : null;
    }
}