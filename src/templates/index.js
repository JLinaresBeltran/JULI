const serviciosPublicosTemplate = require('./serviciosPublicos');
const telecomunicacionesTemplate = require('./telecomunicaciones');
const transporteAereoTemplate = require('./transporteAereo');

const templates = {
    servicios_publicos: serviciosPublicosTemplate,
    telecomunicaciones: telecomunicacionesTemplate,
    transporte_aereo: transporteAereoTemplate
};

/**
 * Obtiene un template por su ID
 * @param {string} templateId - ID del template a obtener
 * @returns {Object} Template solicitado
 * @throws {Error} Si el template no existe
 */
const getTemplateById = (templateId) => {
    const template = templates[templateId];
    if (!template) {
        throw new Error(`Template ${templateId} no encontrado`);
    }
    return template;
};

/**
 * Valida que todos los campos requeridos estén presentes en los datos
 * @param {Object} template - Template a usar para la validación
 * @param {Object} data - Datos a validar
 * @returns {Array} Array de campos faltantes
 */
const validateRequiredFields = (template, data) => {
    const allRequiredFields = [
        ...template.required_fields,
        ...template.user_fields,
        ...template.langchain_fields
    ];

    return allRequiredFields.filter(field => !data[field]);
};

/**
 * Valida completamente los datos contra un template
 * @param {string} templateId - ID del template a usar
 * @param {Object} data - Datos a validar
 * @returns {Object} Resultado de la validación
 */
const validateTemplateData = (templateId, data) => {
    const template = getTemplateById(templateId);
    const missingFields = validateRequiredFields(template, data);

    return {
        isValid: missingFields.length === 0,
        missingFields,
        templateId,
        message: missingFields.length === 0 
            ? 'Todos los campos requeridos están presentes'
            : `Faltan los siguientes campos requeridos: ${missingFields.join(', ')}`
    };
};

/**
 * Obtiene todos los campos requeridos para un template
 * @param {string} templateId - ID del template
 * @returns {Array} Lista de todos los campos requeridos
 */
const getAllRequiredFields = (templateId) => {
    const template = getTemplateById(templateId);
    return [
        ...template.required_fields,
        ...template.user_fields,
        ...template.langchain_fields
    ];
};

module.exports = {
    templates,
    getTemplateById,
    validateTemplateData,
    getAllRequiredFields
};