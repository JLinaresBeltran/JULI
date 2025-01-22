require('dotenv').config();

const googleConfig = {
    apiKey: process.env.GOOGLE_API_KEY,
    sttEndpoint: 'https://speech.googleapis.com/v1p1beta1/speech:recognize',
    ttsEndpoint: 'https://texttospeech.googleapis.com/v1/text:synthesize',
    
    speech: {
        encoding: process.env.GOOGLE_AUDIO_ENCODING || 'LINEAR16',
        sampleRateHertz: parseInt(process.env.GOOGLE_AUDIO_RATE || '48000', 10),
        languageCode: process.env.GOOGLE_LANGUAGE_CODE || 'es-ES',
        model: 'phone_call',
        useEnhanced: true,
        metadata: {
            interactionType: 'DICTATION',
            microphoneDistance: 'NEARFIELD',
            originalMediaType: 'AUDIO_OGG',
            recordingDeviceType: 'SMARTPHONE'
        }
    }
};

if (!googleConfig.apiKey) {
    throw new Error('Se requiere GOOGLE_API_KEY en las variables de entorno');
}

module.exports = { googleConfig };