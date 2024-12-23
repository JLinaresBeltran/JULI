const axios = require('axios');
const { logError, logInfo } = require('../utils/logger');
const googleConfig = require('../config/google');

// -- FUNCIONES DE VALIDACIÓN --
const validateAudioBuffer = (audioBuffer) => {
  if (!audioBuffer || !(audioBuffer instanceof Buffer)) {
    throw new Error('El audio proporcionado no es válido o está vacío.');
  }
};

const validateText = (text) => {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('El texto proporcionado no es válido.');
  }
  if (text.length > 5000) { // Límite recomendado por Google
    throw new Error('El texto proporcionado es demasiado largo.');
  }
};

// -- FUNCIÓN PARA TRANSCRIBIR AUDIO (STT) --
const transcribeAudio = async (audioBuffer) => {
    try {
      validateAudioBuffer(audioBuffer);
  
      const {
        apiKey,
        sttEndpoint,
        defaultAudioEncoding,
        defaultSampleRate
      } = googleConfig;
  
      if (!apiKey) {
        throw new Error('La clave de la API de Google no está configurada.');
      }
  
      // Convertir el buffer de audio a Base64
      const audioContent = audioBuffer.toString('base64');
  
      // Configuración de la solicitud
      const requestBody = {
        config: {
          encoding: defaultAudioEncoding,     // Por ej. 'LINEAR16'
          sampleRateHertz: defaultSampleRate, // Por ej. 16000
          languageCode: 'es-CO',
          enableAutomaticPunctuation: true,
          // Sin especificar "model" ni "useEnhanced", 
          // dejamos que Google use su modelo "default" para es-CO
        },
        audio: {
          content: audioContent,
        },
      };
  
      logInfo('Enviando solicitud STT (modelo default) a Google Speech-to-Text', {
        endpoint: sttEndpoint,
        apiKeyUsed: apiKey.slice(0, 6) + '***',
        requestBody,
      });
  
      const response = await axios.post(`${sttEndpoint}?key=${apiKey}`, requestBody);
  
      if (response.status === 200 && response.data.results) {
        const transcript = response.data.results
          .map((result) => result.alternatives[0].transcript)
          .join('\n');
  
        logInfo('Transcripción completada:', { transcript });
        return transcript;
      } else {
        logError('Respuesta inválida de la API STT:', response.data);
        throw new Error('No se pudo transcribir el audio.');
      }
    } catch (error) {
      if (error.response) {
        logError('Error en transcripción de audio (STT):', {
          status: error.response.status,
          data: error.response.data,
        });
      } else {
        logError('Error en transcripción de audio (STT):', error.message);
      }
      throw new Error('No se pudo transcribir el audio.');
    }
  };

// -- FUNCIÓN PARA SINTETIZAR TEXTO (TTS) --
const synthesizeSpeech = async (text) => {
  try {
    validateText(text);

    const {
      apiKey,
      ttsEndpoint,
      defaultLanguageCode,
      defaultVoice,
      defaultGender
    } = googleConfig;

    if (!apiKey) {
      throw new Error('La clave de la API de Google no está configurada.');
    }

    // Configuración de la solicitud
    const requestBody = {
      input: { text },
      voice: {
        languageCode: defaultLanguageCode,
        name: defaultVoice,
        ssmlGender: defaultGender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
      },
    };

    // Mostrar en logs la configuración completa
    logInfo('Enviando solicitud TTS a Google Text-to-Speech', {
      endpoint: ttsEndpoint,
      apiKeyUsed: apiKey.slice(0, 6) + '***',
      requestBody,
    });

    // Enviar la solicitud a la API de Text-to-Speech
    const response = await axios.post(`${ttsEndpoint}?key=${apiKey}`, requestBody);

    // Evaluar respuesta
    if (response.status === 200 && response.data.audioContent) {
      logInfo('Síntesis de audio completada.');
      return `data:audio/mp3;base64,${response.data.audioContent}`;
    } else {
      logError('Respuesta inválida de la API TTS:', response.data);
      throw new Error('Error en la generación de audio.');
    }
  } catch (error) {
    if (error.response) {
      // Log detallado en caso de error con respuesta
      logError('Error en síntesis de texto (TTS) - Detalles de la respuesta:', {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      logError('Error en síntesis de texto (TTS):', error.message);
    }
    throw new Error('No se pudo generar el audio.');
  }
};

module.exports = { transcribeAudio, synthesizeSpeech };
