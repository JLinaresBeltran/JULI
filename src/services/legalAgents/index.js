const { ChatOpenAI } = require('@langchain/openai');
const { LLMChain } = require("langchain/chains");
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const dotenv = require('dotenv');
const path = require('path');

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
    console.log(`Agente creado: ${name} (${role}) usando modelo ${MODEL_NAME}`);
  }

  async performTask(task, data) {
    console.log(`${this.name} iniciando tarea: ${task}`);
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
      console.error(`Error en ${this.name} al realizar la tarea ${task}: ${error.message}`);
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
      const draft = await this.performTask(
        "classifyAndPrepareDraft",
        { conversation }
      );

      const refinedDocument = await this.performTask(
        "verifyAndRefine",
        {
          junior_analysis: draft,
          customer_data: JSON.stringify(customerData)
        }
      );

      return this.formatDocument(refinedDocument, customerData);
    } catch (error) {
      console.error(`Error procesando queja ${this.sector}: ${error.message}`);
      throw error;
    }
  }

  formatDocument(content, customerData) {
    if (!content || typeof content !== 'string') {
      throw new Error('El contenido proporcionado no es válido');
    }

    // Validar y extraer la información requerida
    const companyName = this.extractCompanyName(content);
    const reference = this.extractReference(content);
    const hechos = this.extractHechos(content);
    const peticion = this.extractPeticion(content);

    if (!companyName || !reference || !hechos.length || !peticion) {
      console.warn('Algunos campos requeridos no fueron encontrados en el contenido');
    }

    return {
      customerName: customerData.name,
      companyName: companyName,
      reference: reference,
      hechos: hechos,
      peticion: peticion,
      metadata: {
        cuenta_contrato: customerData.cuenta_contrato,
        tipo_servicio: customerData.tipo_servicio,
        periodo_facturacion: customerData.periodo_facturacion,
        timestamp: new Date().toISOString(),
        version: "1.0"
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
    console.log('Sistema de Agentes Legales inicializado');
  }

  async processComplaint(sector, conversation, customerData) {
    if (!this.agents[sector]) {
      throw new Error(`Sector no soportado: ${sector}`);
    }

    try {
      return await this.agents[sector].processComplaint(conversation, customerData);
    } catch (error) {
      console.error(`Error en el proceso de queja: ${error.message}`);
      throw error;
    }
  }
}

module.exports = LegalAgentSystem;