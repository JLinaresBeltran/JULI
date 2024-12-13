// Archivo conversationService.js (services/conversationService.js)
const { transcribeAudio, synthesizeText } = require('../integrations/googleSTT');
const { sendMessageToChatbase } = require('../integrations/chatbaseClient');

const handleIncomingAudio = async (audioBuffer) => {
    try {
        // Transcribir audio a texto
        const transcript = await transcribeAudio(audioBuffer);
        console.log('Transcription:', transcript);

        // Enviar texto a Chatbase para procesamiento
        const chatResponse = await sendMessageToChatbase(transcript);
        console.log('Chatbase response:', chatResponse);

        // Convertir respuesta a audio
        const audioResponse = await synthesizeText(chatResponse);
        return audioResponse;
    } catch (error) {
        console.error('Error handling audio:', error);
        throw error;
    }
};

module.exports = { handleIncomingAudio };