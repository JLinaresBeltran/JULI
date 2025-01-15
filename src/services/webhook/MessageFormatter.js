// src/services/webhook/MessageFormatter.js
class MessageFormatter {
    static format(message, changeContext) {
        return {
            id: message.id,
            from: message.from,
            timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
            type: message.type,
            text: message.text?.body || '',
            audio: message.audio?.id,
            direction: 'inbound',
            status: 'received',
            profile: changeContext.value.contacts?.[0],
            metadata: {
                displayPhoneNumber: changeContext.value.metadata?.display_phone_number,
                phoneNumberId: changeContext.value.metadata?.phone_number_id
            }
        };
    }
}