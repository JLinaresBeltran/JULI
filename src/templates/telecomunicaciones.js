// src/templates/telecomunicacionesTemplate.js
const telecomunicacionesTemplate = {
    id: 'telecomunicaciones',
    companyType: 'Empresa de Servicios de Telecomunicaciones',
    regulation: 'Resolución No. 5111 de 2017, Por la cual se establece el Régimen de Protección de los Derechos de los Usuarios de Servicios de Comunicaciones, en concordancia con el artículo 23 de la Constitución Política',

    // Campos específicos requeridos para servicios de telecomunicaciones
    required_fields: [
        'numero_linea',           // Número de línea o servicio afectado
        'tipo_servicio',          // Internet/Telefonía/TV/Planes
        'plan_contratado',        // Detalles del plan
        'fecha_contratacion',     // Fecha de contratación del servicio
        'numero_contrato'         // Número de contrato o cuenta
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

module.exports = telecomunicacionesTemplate;