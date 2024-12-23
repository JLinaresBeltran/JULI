require('dotenv').config(); // Cargar las variables de entorno

// Configuración para las APIs de Google
const googleConfig = {
  apiKey: process.env.GOOGLE_API_KEY, // API Key de Google
  // Speech-to-Text
  sttEndpoint: 'https://speech.googleapis.com/v1/speech:recognize',
  // Text-to-Speech
  ttsEndpoint: 'https://texttospeech.googleapis.com/v1/text:synthesize',
  // Configuraciones por defecto (puedes cambiar según tus necesidades)
  defaultAudioEncoding: process.env.GOOGLE_AUDIO_ENCODING || 'LINEAR16',
  defaultSampleRate: parseInt(process.env.GOOGLE_AUDIO_RATE || '16000', 10),
  defaultLanguageCode: process.env.GOOGLE_LANGUAGE_CODE || 'es-US',
  // Voz por defecto (reemplaza si usas otra)
  defaultVoice: process.env.GOOGLE_VOICE_NAME || 'es-US-Journey-F',
  defaultGender: process.env.GOOGLE_VOICE_GENDER || 'FEMALE',
};

module.exports = googleConfig;
