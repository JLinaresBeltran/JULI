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

        // Palabras clave para clasificación con contextos
        this.categoryPatterns = {
            [this.categories.SERVICIOS_PUBLICOS]: {
                keywords: [
                    'agua', 'luz', 'electricidad', 'gas', 'factura', 'recibo',
                    'servicio público', 'corte', 'reconexión', 'medidor'
                ],
                contexts: [
                    'cobro excesivo', 'alto consumo', 'corte injustificado',
                    'mala facturación', 'error en lectura', 'problema con el servicio'
                ]
            },
            [this.categories.TELECOMUNICACIONES]: {
                keywords: [
                    'internet', 'teléfono', 'celular', 'móvil', 'plan', 'datos',
                    'señal', 'cobertura', 'telefonía', 'wifi', 'router', 'modem'
                ],
                contexts: [
                    'mala señal', 'cobro indebido', 'cambio de plan', 'falla servicio',
                    'velocidad lenta', 'cancelar servicio', 'incumplimiento'
                ]
            },
            [this.categories.TRANSPORTE_AEREO]: {
                keywords: [
                    'vuelo', 'avión', 'aerolínea', 'viaje', 'maleta', 'equipaje',
                    'boleto', 'tiquete', 'reserva', 'aeropuerto'
                ],
                contexts: [
                    'cancelación', 'retraso', 'pérdida equipaje', 'sobreventa',
                    'cambio itinerario', 'compensación', 'reclamo'
                ]
            }
        };
    }

    async classifyQuery(text) {
        try {
            logInfo('Iniciando clasificación de consulta', { textLength: text.length });
            
            const normalizedText = text.toLowerCase().trim();
            const scores = {};

            // Calcular puntuación para cada categoría
            for (const [category, patterns] of Object.entries(this.categoryPatterns)) {
                scores[category] = this._calculateDetailedScore(normalizedText, patterns);
            }

            // Obtener la categoría con mayor puntuación
            const [topCategory] = Object.entries(scores)
                .sort(([,a], [,b]) => b.totalScore - a.totalScore);

            const result = {
                category: topCategory[1].totalScore >= 1 ? topCategory[0] : this.categories.UNKNOWN,
                confidence: topCategory[1].totalScore,
                details: {
                    keywordMatches: topCategory[1].keywordMatches,
                    contextMatches: topCategory[1].contextMatches,
                    allScores: scores
                }
            };

            logInfo('Clasificación completada', {
                category: result.category,
                confidence: result.confidence,
                textPreview: normalizedText.substring(0, 50)
            });

            return result;

        } catch (error) {
            logError('Error en clasificación de consulta', {
                error: error.message,
                textLength: text?.length
            });
            return {
                category: this.categories.UNKNOWN,
                confidence: 0,
                error: error.message
            };
        }
    }

    _calculateDetailedScore(text, patterns) {
        const keywordMatches = patterns.keywords
            .filter(keyword => text.includes(keyword))
            .map(keyword => ({ term: keyword, type: 'keyword' }));

        const contextMatches = patterns.contexts
            .filter(context => text.includes(context))
            .map(context => ({ term: context, type: 'context' }));

        const keywordScore = keywordMatches.length * 1.0;
        const contextScore = contextMatches.length * 0.5;

        return {
            totalScore: keywordScore + contextScore,
            keywordMatches,
            contextMatches,
            scores: {
                keywords: keywordScore,
                context: contextScore
            }
        };
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