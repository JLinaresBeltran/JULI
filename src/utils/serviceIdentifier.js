const { logInfo } = require('./logger');

const SERVICE_KEYWORDS = {
    SERVICIOS_PUBLICOS: [
        'agua', 'luz', 'electricidad', 'gas', 'alcantarillado',
        'basura', 'factura', 'corte', 'reconexión', 'medidor',
        'servicios públicos', 'recibo', 'consumo'
    ],
    TELECOMUNICACIONES: [
        'internet', 'teléfono', 'celular', 'móvil', 'señal',
        'plan', 'datos', 'fibra', 'cable', 'wifi', 'línea',
        'telefonía', 'comunicaciones', 'banda ancha'
    ],
    TRANSPORTE_AEREO: [
        'vuelo', 'avión', 'aerolínea', 'equipaje', 'maleta',
        'boleto', 'pasaje', 'reserva', 'cancelación', 'retraso',
        'aeropuerto', 'viaje', 'tiquete'
    ]
};

async function identifyServiceType(message) {
    const normalizedMessage = message.toLowerCase();
    
    // Contar coincidencias de palabras clave por servicio
    const matches = {
        SERVICIOS_PUBLICOS: 0,
        TELECOMUNICACIONES: 0,
        TRANSPORTE_AEREO: 0
    };

    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
        matches[service] = keywords.filter(keyword => 
            normalizedMessage.includes(keyword.toLowerCase())
        ).length;
    }

    // Encontrar el servicio con más coincidencias
    const [serviceType] = Object.entries(matches)
        .sort(([,a], [,b]) => b - a)[0];

    // Si hay coincidencias, registrar el resultado
    if (matches[serviceType] > 0) {
        logInfo('Service type identified', {
            message: normalizedMessage,
            serviceType,
            matchCount: matches[serviceType]
        });
        return serviceType;
    }

    logInfo('No service type identified', {
        message: normalizedMessage
    });
    return null;
}

module.exports = {
    identifyServiceType,
    SERVICE_KEYWORDS
};