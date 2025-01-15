// src/services/conversation/ConversationValidator.js
const { logError, logInfo } = require('../../utils/logger');

class ConversationValidator {
    static validateMessage(message) {
        return this.validateBasicStructure(message) && 
               this.validateMessageType(message);
    }

    static validateBasicStructure(message) {
        if (!message || typeof message !== 'object') {
            logError('Mensaje inválido - no es un objeto');
            return false;
        }

        if (!message.from || !message.id || !message.type) {
            logError('Campos requeridos faltantes', {
                hasFrom: !!message.from,
                hasId: !!message.id,
                hasType: !!message.type
            });
            return false;
        }

        return true;
    }

    static validateMessageType(message) {
        const typeValidators = {
            text: () => !!message.text?.body?.trim(),
            audio: () => !!message.audio?.id,
            document: () => !!message.document?.id
        };

        if (!typeValidators[message.type]) {
            logError('Tipo de mensaje no soportado', { type: message.type });
            return false;
        }

        return typeValidators[message.type]();
    }
}

module.exports = ConversationValidator;