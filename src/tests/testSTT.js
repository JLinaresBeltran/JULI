const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('../services/googleService');

(async () => {
  try {
    // Ruta al archivo de prueba de audio (asegúrate del formato LINEAR16 / 16000 Hz si eso configuras)
    const audioFilePath = path.resolve(__dirname, './test_audio.raw');
    const audioBuffer = fs.readFileSync(audioFilePath);

    console.log('Iniciando transcripción de audio...');
    const transcript = await transcribeAudio(audioBuffer);
    console.log('Transcripción completada:');
    console.log(transcript);
  } catch (error) {
    console.error('Error durante la prueba de transcripción:', error.message);
  }
})();
