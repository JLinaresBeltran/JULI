// src/tests/conversationServiceTest.js
const conversationService = require('../services/conversationService');
const { logInfo } = require('../utils/logger');

async function testConversationService() {
    try {
        logInfo('Iniciando pruebas del servicio de conversación');

        // 1. Test mensaje de texto
        const textMessage = {
            from: '1234567890',
            id: 'msg_1',
            type: 'text',
            text: {
                body: 'Hola, este es un mensaje de prueba'
            },
            timestamp: Date.now()
        };

        logInfo('Probando procesamiento de mensaje de texto');
        const conversation = await conversationService.processIncomingMessage(textMessage);
        
        // Validación de conversación
        if (!conversation) {
            throw new Error('No se creó la conversación');
        }

        logInfo('Conversación creada exitosamente', {
            whatsappId: conversation.whatsappId,
            messageCount: conversation.messages.length
        });

        // 2. Test mensaje de audio
        const audioMessage = {
            from: '1234567890',
            id: 'msg_2',
            type: 'audio',
            audio: {
                id: 'audio_1',
                content: 'mock_audio_content'
            },
            timestamp: Date.now()
        };

        logInfo('Probando procesamiento de mensaje de audio');
        await conversationService.processIncomingMessage(audioMessage);

        // Verificación del estado
        const updatedConversation = conversationService.getConversation('1234567890');
        logInfo('Estado de la conversación después de audio', {
            messageCount: updatedConversation.messages.length,
            lastMessage: updatedConversation.messages[updatedConversation.messages.length - 1],
            transcriptions: updatedConversation.metadata.audioTranscriptions
        });

        // 3. Test de estadísticas
        const activeCount = conversationService.getActiveConversationCount();
        logInfo('Estadísticas del servicio', { 
            conversacionesActivas: activeCount
        });

        // 4. Test de cierre
        logInfo('Probando cierre de conversación');
        await conversationService.closeConversation('1234567890');
        
        const closedConversation = conversationService.getConversation('1234567890');
        if (closedConversation) {
            throw new Error('La conversación no se cerró correctamente');
        }

        logInfo('Todas las pruebas completadas exitosamente');
        return true;

    } catch (error) {
        logInfo('Error en las pruebas:', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

// Ejecutar pruebas
testConversationService().then(success => {
    logInfo('Resultado final de las pruebas:', { success });
    process.exit(success ? 0 : 1);
});