const fs = require('fs');
const path = require('path');
const { synthesizeSpeech } = require('../services/googleService');

(async () => {
  try {
    // Texto para sintetizar
    const text = 'Hola, este es un ejemplo de síntesis de texto a voz del aplicativo Jurídica en línea.';
    
    console.log('Iniciando síntesis de texto a voz...');
    const audioContent = await synthesizeSpeech(text);

    // Guardar el audio generado como archivo MP3
    const outputFilePath = path.resolve(__dirname, './test_output.mp3');
    // audioContent viene en formato data URI, así que separamos
    const base64Audio = audioContent.split(',')[1]; // Extraer el contenido base64
    fs.writeFileSync(outputFilePath, Buffer.from(base64Audio, 'base64'));

    console.log('Audio generado correctamente y guardado en:', outputFilePath);
  } catch (error) {
    console.error('Error durante la prueba de síntesis:', error.message);
  }
})();
