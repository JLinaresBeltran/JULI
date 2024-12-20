const { SpeechClient } = require('@google-cloud/speech');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Inicializar clientes de Google
const speechClient = new SpeechClient({
    projectId: process.env.GOOGLE_PROJECT_ID,
    keyFilename: path.resolve(__dirname, process.env.GOOGLE_CREDENTIALS_PATH),
});

const ttsClient = new TextToSpeechClient({
    projectId: process.env.GOOGLE_PROJECT_ID,
    keyFilename: path.resolve(__dirname, process.env.GOOGLE_CREDENTIALS_PATH),
});

module.exports = {
    speechClient,
    ttsClient,
};
