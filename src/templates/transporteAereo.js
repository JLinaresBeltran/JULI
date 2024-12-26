// src/templates/transporteAereoTemplate.js

const transporteAereoTemplate = {
    id: 'transporte_aereo',
    companyType: 'Aerolínea Comercial',
    regulation: 'Reglamentos Aeronáuticos de Colombia (RAC), Resolución 02591 de 2013 de la Aerocivil y el artículo 23 de la Constitución Política',

    // Campos específicos requeridos para servicios de transporte aéreo
    required_fields: [
        'numero_reserva',         // Código de reserva
        'numero_vuelo',           // Número de vuelo
        'fecha_vuelo',            // Fecha del vuelo
        'ruta',                   // Ruta del vuelo (origen-destino)
        'valor_tiquete',          // Valor pagado por el tiquete
    ],

    // Campos del usuario que deben estar presentes (heredados del template base)
    user_fields: [
        'customerName',
        'documentNumber',
        'email',
        'phone',
        'address'
    ],

    // Campos que vienen del procesamiento de LangChain
    langchain_fields: [
        'hechos',
        'peticion'
    ],
};

module.exports = transporteAereoTemplate;