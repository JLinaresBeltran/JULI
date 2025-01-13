// src/services/email/templates/transporteAereoEmail.js
const BaseEmailTemplate = require('./baseEmailTemplate');

class TransporteAereoEmailTemplate extends BaseEmailTemplate {
    constructor() {
        const serviceSpecificContent = {
            title: 'Reclamación Transporte Aéreo',
            headerText: 'Su Derecho de Petición - Transporte Aéreo',
            getMainContent: (lead) => `
                <p>Para gestionar su reclamación de servicios de transporte aéreo, siga estas instrucciones:</p>
                <ul style="list-style-type: none; padding-left: 0;">
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">✈️ Radicación:</strong> 
                        Presente el documento en la oficina de atención al usuario de la aerolínea o a través de su portal web.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">🔢 Código de Radicado:</strong> 
                        Guarde el número de radicado y la fecha de presentación de su reclamación.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">⏱️ Plazo de Respuesta:</strong> 
                        La aerolínea tiene 15 días hábiles según los RAC para responder su petición.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">📋 Documentación:</strong> 
                        Conserve tiquetes, facturas, tarjetas de embarque y toda comunicación con la aerolínea.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">⚖️ Recursos:</strong> 
                        Si la respuesta no es satisfactoria, tiene 10 días para presentar recursos ante la Aerocivil.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">🏛️ Aerocivil:</strong> 
                        La Aeronáutica Civil actuará como entidad reguladora en su caso.
                    </li>
                </ul>
                
                <p style="margin-top: 20px;">
                    <strong class="bold-text">Recuerde:</strong> JULI está disponible 24/7 para asesorarlo durante todo el proceso de su reclamación.
                </p>
            `
        };
        super(serviceSpecificContent);
    }

    getSubject(lead) {
        return `Reclamación Transporte Aéreo - ${lead.name}`;
    }

    getPlainText(lead) {
        return `
            Estimado/a ${lead.name},
            
            Adjunto encontrará su documento de reclamación para servicios de transporte aéreo.
            
            Por favor, siga las instrucciones detalladas en el correo para asegurar un proceso efectivo.
            
            Atentamente,
            Equipo de Jurídica en Línea
        `;
    }
}

module.exports = new TransporteAereoEmailTemplate();