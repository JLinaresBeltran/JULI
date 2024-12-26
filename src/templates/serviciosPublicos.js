// src/templates/serviciosPublicos.js
const serviciosPublicosTemplate = {
    id: 'servicios_publicos',
    companyType: 'Empresa de Servicios Públicos Domiciliarios',
    regulation: 'Ley 142 de 1994, en concordancia con el artículo 23 de la Constitución Política',

    // Campos específicos requeridos para servicios públicos
    required_fields: [
        'cuenta_contrato',
        'tipo_servicio',
        'direccion_servicio',
        'periodo_facturacion'
    ],

    // Campos del usuario que deben estar presentes
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
    ]
};

module.exports = serviciosPublicosTemplate;