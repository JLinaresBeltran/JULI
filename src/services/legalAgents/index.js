const { ChatOpenAI } = require('@langchain/openai');
const { LLMChain } = require("langchain/chains");
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const dotenv = require('dotenv');
const path = require('path');
const { logError, logInfo } = require('../../utils/logger');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SERVICIOS_PUBLICOS_PROMPTS = require('./prompts/serviciosPublicos');
const TELECOMUNICACIONES_PROMPTS = require('./prompts/telecomunicaciones'); 
const TRANSPORTE_AEREO_PROMPTS = require('./prompts/transporteAereo');

const MODEL_NAME = "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("La clave API de OpenAI no está configurada en las variables de entorno.");
}

const openAIModel = new ChatOpenAI({ 
  modelName: MODEL_NAME,
  temperature: 0.3,
  openAIApiKey: OPENAI_API_KEY
});

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           (error.response && error.response.status === 429);
  }
});

const SECTOR_PROMPTS = {
  servicios_publicos: SERVICIOS_PUBLICOS_PROMPTS,
  telecomunicaciones: TELECOMUNICACIONES_PROMPTS,
  transporte_aereo: TRANSPORTE_AEREO_PROMPTS
};

class Agent {
  constructor(name, role, sector) {
    this.name = name;
    this.role = role; 
    this.sector = sector;
    this.model = openAIModel;
    this.prompts = SECTOR_PROMPTS[sector];
    logInfo(`Agente creado: ${name} (${role}) usando modelo ${MODEL_NAME}`);
  }

  async performTask(task, data) {
    logInfo(`${this.name} iniciando tarea: ${task}`);
    const prompt = this.prompts[task];
    
    if (!prompt) {
      throw new Error(`No hay prompt definido para la tarea: ${task}`);
    }

    try {
      const chain = new LLMChain({ 
        llm: this.model,
        prompt: prompt,
        verbose: true
      });

      const result = await chain.call(data);
      return result.text;
    } catch (error) {
      logError(`Error en ${this.name} al realizar la tarea ${task}:`, error);
      throw error;
    }
  }
}

class SectorSpecificAgent extends Agent {
  constructor(sector) {
    super(`Agente Legal ${sector}`, "Analista y Revisor", sector);
  }

  async processComplaint(conversation, customerData) {
    try {
      // Validar datos mínimos requeridos
      this._validateMinimumData(customerData);

      // Preparar el análisis inicial
      const draft = await this.performTask(
        "classifyAndPrepareDraft",
        { conversation }
      );

      // Refinar el documento con los datos del cliente
      const refinedDocument = await this.performTask(
        "verifyAndRefine",
        {
          junior_analysis: draft,
          customer_data: JSON.stringify(this._sanitizeCustomerData(customerData))
        }
      );

      return this.formatDocument(refinedDocument, customerData);
    } catch (error) {
      logError(`Error procesando queja ${this.sector}:`, error);
      throw error;
    }
  }

  _validateMinimumData(customerData) {
    const minimumRequired = ['name', 'email', 'phone'];
    const missing = minimumRequired.filter(field => !customerData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Datos requeridos faltantes: ${missing.join(', ')}`);
    }
  }

  _sanitizeCustomerData(customerData) {
    // Datos base que siempre deben estar presentes
    const baseData = {
      name: customerData.name,
      email: customerData.email,
      phone: customerData.phone,
      documentNumber: customerData.documentNumber || '',
      address: customerData.address || 'No especificado'
    };

    // Datos específicos según el sector
    const sectorData = this._getSectorSpecificData(customerData);

    return {
      ...baseData,
      ...sectorData
    };
  }

  _getSectorSpecificData(customerData) {
    switch(this.sector) {
      case 'transporte_aereo':
        return {
          numero_reserva: customerData.numero_reserva || 'No especificado',
          numero_vuelo: customerData.numero_vuelo || 'No especificado',
          fecha_vuelo: customerData.fecha_vuelo || 'No especificado',
          ruta: customerData.ruta || 'No especificado',
          valor_tiquete: customerData.valor_tiquete || 'No especificado'
        };
      case 'servicios_publicos':
        return {
          cuenta_contrato: customerData.cuenta_contrato || 'No especificado',
          tipo_servicio: customerData.tipo_servicio || 'No especificado',
          periodo_facturacion: customerData.periodo_facturacion || 'No especificado'
        };
      case 'telecomunicaciones':
        return {
          numero_linea: customerData.numero_linea || 'No especificado',
          plan_contratado: customerData.plan_contratado || 'No especificado',
          fecha_contratacion: customerData.fecha_contratacion || 'No especificado'
        };
      default:
        return {};
    }
  }

  formatDocument(content, customerData) {
    if (!content || typeof content !== 'string') {
      throw new Error('El contenido proporcionado no es válido');
    }

    // Extraer información del contenido
    const companyName = this.extractCompanyName(content);
    const reference = this.extractReference(content);
    const hechos = this.extractHechos(content);
    const peticion = this.extractPeticion(content);

    if (!companyName || !reference || !hechos.length || !peticion) {
      logInfo('Algunos campos requeridos no fueron encontrados en el contenido');
    }

    // Construir el documento final
    return {
      customerName: customerData.name,
      companyName: companyName,
      reference: reference,
      hechos: hechos,
      peticion: peticion,
      metadata: {
        category: this.sector,
        timestamp: new Date().toISOString(),
        version: "1.0",
        customerEmail: customerData.email,
        customerPhone: customerData.phone,
        ...this._getSectorSpecificData(customerData)
      }
    };
  }

  extractCompanyName(content) {
    const match = content.match(/EMPRESA DE SERVICIOS: (.*?)(?:\n|$)/);
    return match ? match[1].trim() : "EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTÁ E.S.P.";
  }

  extractReference(content) {
    const match = content.match(/REFERENCIA: (.*?)(?:\n|$)/);
    return match ? match[1].trim() : "Reclamación de servicios públicos";
  }

  extractHechos(content) {
    const hechosSection = content.match(/HECHOS:\n([\s\S]*?)PETICIÓN:/);
    if (!hechosSection) return ['No se encontraron hechos'];
    
    return hechosSection[1].trim()
      .split('\n')
      .filter(line => /^\d+\./.test(line))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  extractPeticion(content) {
    const peticionMatch = content.match(/PETICIÓN:\n([\s\S]*?)(?:\n\n|$)/);
    return peticionMatch ? peticionMatch[1].trim() : 'No se encontró petición';
  }
}

class LegalAgentSystem {
  constructor() {
    this.agents = {
      servicios_publicos: new SectorSpecificAgent('servicios_publicos'),
      telecomunicaciones: new SectorSpecificAgent('telecomunicaciones'),
      transporte_aereo: new SectorSpecificAgent('transporte_aereo')
    };
    logInfo('Sistema de Agentes Legales inicializado');
  }

  async processComplaint(sector, conversation, customerData) {
    if (!this.agents[sector]) {
      throw new Error(`Sector no soportado: ${sector}`);
    }

    try {
      return await this.agents[sector].processComplaint(conversation, customerData);
    } catch (error) {
      logError(`Error en el proceso de queja:`, error);
      throw error;
    }
  }
}

module.exports = new LegalAgentSystem();