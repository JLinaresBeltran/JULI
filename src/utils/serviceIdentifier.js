const SERVICE_KEYWORDS = {
    SERVICIOS_PUBLICOS: [
        'agua', 'luz', 'electricidad', 'gas', 'alcantarillado',
        'basura', 'factura', 'corte', 'reconexión', 'medidor'
    ],
    TELECOMUNICACIONES: [
        'internet', 'teléfono', 'celular', 'móvil', 'señal',
        'plan', 'datos', 'fibra', 'cable', 'wifi', 'línea'
    ],
    TRANSPORTE_AEREO: [
        'vuelo', 'avión', 'aerolínea', 'equipaje', 'maleta',
        'boleto', 'pasaje', 'reserva', 'cancelación', 'retraso'
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
            normalizedMessage.includes(keyword)
        ).length;
    }

    // Encontrar el servicio con más coincidencias
    const [serviceType] = Object.entries(matches)
        .sort(([,a], [,b]) => b - a)[0];

    // Si no hay coincidencias claras, retornar null
    if (matches[serviceType] === 0) {
        return null;
    }

    return serviceType;
}

module.exports = {
    identifyServiceType,
    SERVICE_KEYWORDS
};