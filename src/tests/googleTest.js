const fs = require('fs');
const path = require('path');
const { transcribeAudio, synthesizeSpeech } = require('../services/googleService');

// Prueba de STT con archivo de audio
const testSTT = async () => {
    try {
        const audioPath = path.resolve(__dirname, './sample_audio.wav'); // Ruta al archivo de prueba
        const audioBuffer = fs.readFileSync(audioPath);
        const transcription = await transcribeAudio(audioBuffer);
        console.log('Transcripción obtenida:', transcription);
    } catch (error) {
        console.error('Error durante la prueba de STT:', error.message);
    }
};

// Prueba de TTS con texto de ejemplo
const testTTS = async () => {
    try {
        const text = 'Hola, esta es una prueba de síntesis de voz.';
        const audioContent = await synthesizeSpeech(text);
        const outputPath = path.resolve(__dirname, './output_audio.mp3'); // Ruta de salida
        fs.writeFileSync(outputPath, audioContent, 'binary');
        console.log('Audio generado en:', outputPath);
    } catch (error) {
        console.error('Error durante la prueba de TTS:', error.message);
    }
};

// Ejecutar pruebas
(async () => {
    console.log('Iniciando pruebas para Google STT/TTS...');
    await testSTT();
    await testTTS();
})();
