// src/services/email/templates/telecomunicacionesEmail.js
const BaseEmailTemplate = require('./baseEmailTemplate');

class TelecomunicacionesEmailTemplate extends BaseEmailTemplate {
    constructor() {
        const serviceSpecificContent = {
            title: 'Reclamación Servicios de Telecomunicaciones',
            headerText: 'Su Derecho de Petición - Telecomunicaciones',
            getMainContent: (lead) => `
                <p>Para gestionar efectivamente su reclamación de servicios de telecomunicaciones, siga estos pasos:</p>
                <ul style="list-style-type: none; padding-left: 0;">
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">💻 Oficina Virtual:</strong> 
                        Puede radicar el documento adjunto a través del portal virtual de la empresa o en una oficina física.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">🔑 CUN:</strong> 
                        Exija y guarde su Código Único Numérico (CUN). Este código es obligatorio y esencial para el seguimiento.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">⏰ Tiempo de Respuesta:</strong> 
                        La empresa tiene 15 días hábiles para responder su PQR según la Resolución CRC 5111 de 2017.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">📸 Registro de Evidencias:</strong> 
                        Guarde capturas de pantalla, grabaciones de llamadas o cualquier prueba relevante.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">⚖️ Recursos:</strong> 
                        Si la respuesta no es satisfactoria, tiene 10 días hábiles para presentar el recurso de reposición y subsidiario de apelación.
                    </li>
                    
                    <li style="margin-bottom: 15px;">
                        <strong class="bold-text">🏛️ SIC:</strong> 
                        La Superintendencia de Industria y Comercio actuará como segunda instancia en su caso.
                    </li>
                </ul>
                
                <p style="margin-top: 20px;">
                    <strong class="bold-text">Importante:</strong> JULI está disponible 24/7 para resolver sus dudas y guiarle durante todo el proceso.
                </p>
            `
        };
        super(serviceSpecificContent);
    }

    getSubject(lead) {
        return `Reclamación Telecomunicaciones - ${lead.name}`;
    }

    getPlainText(lead) {
        return `
            Estimado/a ${lead.name},
            
            Adjunto encontrará su documento de reclamación para servicios de telecomunicaciones.
            
            Por favor, siga las instrucciones detalladas en el correo para asegurar un proceso efectivo.
            
            Atentamente,
            Equipo de Jurídica en Línea
        `;
    }
}

module.exports = new TelecomunicacionesEmailTemplate();