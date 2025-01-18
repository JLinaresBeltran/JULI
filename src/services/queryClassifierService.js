// src/services/queryClassifierService.js
const { logInfo, logError } = require('../utils/logger');

class QueryClassifierService {
    constructor() {
        this.categories = {
            SERVICIOS_PUBLICOS: 'servicios_publicos',
            TELECOMUNICACIONES: 'telecomunicaciones',
            TRANSPORTE_AEREO: 'transporte_aereo',
            UNKNOWN: 'unknown'
        };

        this.keywords = {
            [this.categories.SERVICIOS_PUBLICOS]: [
                'agua', 'luz', 'electricidad', 'gas', 'factura', 'recibo',
                'servicio público', 'corte', 'reconexión', 'medidor', 'consumo'
            ],
            [this.categories.TELECOMUNICACIONES]: [
                'internet', 'teléfono', 'celular', 'móvil', 'plan', 'datos',
                'señal', 'cobertura', 'telefonía', 'wifi', 'router', 'modem'
            ],
            [this.categories.TRANSPORTE_AEREO]: [
                'vuelo', 'avión', 'aerolínea', 'viaje', 'maleta', 'equipaje',
                'boleto', 'tiquete', 'reserva', 'aeropuerto', 'pasaje'
            ]
        };
    }

    async classifyQuery(text) {
        try {
            if (!text) {
                return this._createResponse(this.categories.UNKNOWN, 0);
            }

            logInfo('Iniciando clasificación de consulta', { 
                textLength: text.length 
            });
            
            const normalizedText = text.toLowerCase().trim();
            const scores = {};

            // Calcular puntuación para cada categoría
            for (const [category, keywords] of Object.entries(this.keywords)) {
                scores[category] = this._calculateScore(normalizedText, keywords);
            }

            // Obtener la categoría con mayor puntuación
            const [topCategory] = Object.entries(scores)
                .sort(([,a], [,b]) => b - a);

            // Solo clasificar si la puntuación supera el umbral
            const finalCategory = topCategory[1] >= 1 ? 
                topCategory[0] : this.categories.UNKNOWN;

            const response = this._createResponse(finalCategory, topCategory[1], scores);

            logInfo('Clasificación completada', { 
                category: response.category,
                confidence: response.confidence,
                textPreview: normalizedText.substring(0, 50) 
            });

            return response;

        } catch (error) {
            logError('Error en clasificación de consulta', {
                error: error.message,
                textLength: text?.length
            });
            return this._createResponse(this.categories.UNKNOWN, 0, null, error.message);
        }
    }

    _calculateScore(text, keywords) {
        return keywords.reduce((score, keyword) => {
            if (text.includes(keyword)) {
                // Coincidencia exacta
                score += 1;
            } else if (text.split(' ').some(word => 
                word.includes(keyword) || keyword.includes(word))) {
                // Coincidencia parcial
                score += 0.5;
            }
            return score;
        }, 0);
    }

    _createResponse(category, confidence, scores = null, error = null) {
        const response = {
            category,
            confidence: Number(confidence.toFixed(2)),
            timestamp: new Date().toISOString()
        };

        if (scores) {
            response.details = { scores };
        }

        if (error) {
            response.error = error;
        }

        return response;
    }

    getChatbaseConfig(category) {
        if (!Object.values(this.categories).includes(category)) {
            logError('Categoría inválida solicitada', { category });
            throw new Error(`Categoría inválida: ${category}`);
        }
        return category;
    }

    getCategories() {
        return Object.values(this.categories);
    }
}

module.exports = new QueryClassifierService();