// src/services/queryClassifierService.js
const { logInfo, logError } = require('../utils/logger');

class QueryClassifierService {
    constructor() {
        this.categories = {
            SERVICIOS_PUBLICOS: 'servicios_publicos',
            TELECOMUNICACIONES: 'telecomunicaciones',
            TRANSPORTE_AEREO: 'transporte_aereo'
        };

        // Palabras clave para clasificación
        this.keywords = {
            [this.categories.SERVICIOS_PUBLICOS]: [
                'agua', 'luz', 'electricidad', 'gas', 'factura', 'recibo',
                'servicio público', 'corte', 'reconexión', 'medidor'
            ],
            [this.categories.TELECOMUNICACIONES]: [
                'internet', 'teléfono', 'celular', 'móvil', 'plan', 'datos',
                'señal', 'cobertura', 'telefonía', 'wifi', 'router', 'modem'
            ],
            [this.categories.TRANSPORTE_AEREO]: [
                'vuelo', 'avión', 'aerolínea', 'viaje', 'maleta', 'equipaje',
                'boleto', 'tiquete', 'reserva', 'aeropuerto'
            ]
        };
    }

    classifyQuery(text) {
        try {
            logInfo('Clasificando consulta', { text });
            
            const normalizedText = text.toLowerCase();
            const scores = {};

            // Calcular puntuación para cada categoría
            for (const [category, keywords] of Object.entries(this.keywords)) {
                scores[category] = this._calculateScore(normalizedText, keywords);
            }

            // Obtener la categoría con mayor puntuación
            const [topCategory] = Object.entries(scores)
                .sort(([,a], [,b]) => b - a);

            const result = {
                category: topCategory[0],
                confidence: topCategory[1],
                scores
            };

            logInfo('Resultado de clasificación', result);
            return result;

        } catch (error) {
            logError('Error en clasificación de consulta', {
                error: error.message,
                text
            });
            throw error;
        }
    }

    _calculateScore(text, keywords) {
        return keywords.reduce((score, keyword) => {
            // Buscar coincidencias exactas y parciales
            const exactMatch = text.includes(keyword) ? 1 : 0;
            const partialMatches = text.split(' ')
                .filter(word => word.includes(keyword) || keyword.includes(word))
                .length * 0.5;
            
            return score + exactMatch + partialMatches;
        }, 0);
    }

    getChatbaseConfig(category) {
        // Verificar que la categoría sea válida
        if (!Object.values(this.categories).includes(category)) {
            throw new Error(`Categoría inválida: ${category}`);
        }
        return category;
    }
}

module.exports = new QueryClassifierService();