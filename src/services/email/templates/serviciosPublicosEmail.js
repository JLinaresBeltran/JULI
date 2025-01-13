// src/services/email/templates/serviciosPublicosEmail.js
const BaseEmailTemplate = require('./baseEmailTemplate');

class ServiciosPublicosEmailTemplate extends BaseEmailTemplate {
    constructor() {
        const serviceSpecificContent = {
            title: 'Reclamación Servicios Públicos Domiciliarios',
            headerText: 'Su Derecho de Petición - Servicios Públicos',
            getMainContent: (lead) => `
                <p>Para asegurar que su reclamación de servicios públicos sea procesada efectivamente, siga estos pasos:</p>
                <ul style="list-style-type: none; padding-left: 0;">
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">📋 Radicación:</strong> 
                        Presente el documento adjunto en la oficina de atención al usuario de la empresa prestadora del servicio.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">🔢 Número de Radicado:</strong> 
                        Exija y guarde su número de radicado. Este número es fundamental para el seguimiento de su caso.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">⏱️ Plazo de Respuesta:</strong> 
                        La empresa tiene 15 días hábiles para responder su petición según la Ley 142 de 1994.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">📝 Evidencias:</strong> 
                        Conserve copias de facturas, reportes técnicos y toda comunicación con la empresa.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">⚖️ Recursos:</strong> 
                        Si la respuesta no es satisfactoria, tiene 5 días hábiles para presentar recursos de reposición y apelación.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">👥 Superservicios:</strong> 
                        La Superintendencia de Servicios Públicos actuará como segunda instancia en su reclamación.
                    </li>
                </ul>
                
                <p style="margin-top: 20px;">
                    <strong class="bold-text">Recuerde:</strong> JULI está disponible 24/7 para resolver sus dudas y brindarle orientación durante todo el proceso.
                </p>
            `
        };
        super(serviceSpecificContent);
    }

    getSubject(lead) {
        return `Reclamación Servicios Públicos - ${lead.name}`;
    }

    getPlainText(lead) {
        return `
            Estimado/a ${lead.name},
            
            Adjunto encontrará su documento de reclamación para servicios públicos domiciliarios.
            
            Por favor, siga las instrucciones detalladas en el correo para asegurar un proceso efectivo.
            
            Atentamente,
            Equipo de Jurídica en Línea
        `;
    }
}

module.exports = new ServiciosPublicosEmailTemplate();