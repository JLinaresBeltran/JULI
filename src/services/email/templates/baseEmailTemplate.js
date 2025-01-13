// src/services/email/templates/baseEmailTemplate.js
const path = require('path');

class BaseEmailTemplate {
    constructor(serviceSpecificContent) {
        this.serviceSpecificContent = serviceSpecificContent;
        this.imagesPath = path.join(__dirname, '../images');
    }

    generateEmailContent(lead, serverUrl) {
        return {
            subject: this.getSubject(lead),
            text: this.getPlainText(lead),
            html: this.getHTML(lead, serverUrl)
        };
    }

    getHTML(lead, serverUrl) {
        return `<!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="color-scheme" content="light dark">
            <meta name="supported-color-schemes" content="light dark">
            <title>${this.serviceSpecificContent.title}</title>
            <style>
                ${this.getBaseStyles(serverUrl)}
            </style>
        </head>
        <body>
            <div class="container mt-4">
                <div class="card container-custom">
                    <div class="header card-img-top position-relative">
                        <img src="cid:imagen-superior.png" class="header-img" alt="Header">
                    </div>
                    <div class="header-text">${this.serviceSpecificContent.headerText}</div>
                    <div class="content card-body">
                        <p class="bold-text">Hola ${lead.name},</p>
                        ${this.serviceSpecificContent.getMainContent(lead)}
                        ${this.getButtons()}
                    </div>
                </div>
                <div class="image-container">
                    <img src="cid:servicios.png" alt="Servicios" class="img-fluid">
                </div>
                ${this.getFooter(lead)}
            </div>
        </body>
        </html>`;
    }

    getBaseStyles(serverUrl) {
        return `
            :root {
                color-scheme: light dark;
                supported-color-schemes: light dark;
            }

            @media (prefers-color-scheme: light) {
                :root {
                    --background-color: #ffffff;
                    --text-color: #022440;
                    --container-bg: rgba(63, 243, 242, 0.16);
                    --header-bg: #022440;
                    --button-bg: #1e89a7;
                    --button-hover: #04315a;
                    --link-color: #04315a;
                }
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --background-color: #1a1a1a;
                    --text-color: #ffffff;
                    --container-bg: rgba(63, 243, 242, 0.05);
                    --header-bg: #0a0a0a;
                    --button-bg: #2a9ab8;
                    --button-hover: #1e89a7;
                    --link-color: #63b3ff;
                }
            }

            @font-face {
                font-family: 'Nasalization';
                src: url('${serverUrl}/fonts/nasalization-free.rg-regular.otf') format('opentype');
            }

            @font-face {
                font-family: 'HelveticaNeue';
                src: url('${serverUrl}/fonts/HelveticaNeue Regular.ttf') format('truetype');
            }

            body {
                font-family: 'HelveticaNeue', Arial, sans-serif;
                background-color: var(--background-color);
                margin: 0;
                padding: 20px;
                line-height: 1.6;
                color: var(--text-color);
            }

            .container-custom {
                max-width: 600px;
                margin: 0 auto;
                background-color: var(--container-bg);
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }

            .header-img {
                width: 100%;
                height: auto;
                border-radius: 8px 8px 0 0;
            }

            .header-text {
                background-color: var(--header-bg);
                color: white;
                padding: 15px;
                text-align: center;
                font-family: 'Nasalization', Arial, sans-serif;
                font-size: 18px;
            }

            .content {
                padding: 20px;
            }

            .bold-text {
                font-weight: bold;
            }

            .custom-button {
                display: inline-block;
                width: 100%;
                padding: 12px;
                margin: 10px 0;
                background-color: var(--button-bg);
                color: white;
                text-decoration: none;
                text-align: center;
                border-radius: 4px;
                font-family: 'Nasalization', Arial, sans-serif;
                transition: background-color 0.3s ease;
            }

            .custom-button:hover {
                background-color: var(--button-hover);
            }

            .footer {
                text-align: center;
                margin-top: 20px;
            }

            .footer img {
                max-width: 150px;
                margin: 10px;
            }

            @media screen and (max-width: 600px) {
                body {
                    padding: 10px;
                }

                .container-custom {
                    padding: 10px;
                }

                .header-text {
                    font-size: 16px;
                }

                .custom-button {
                    padding: 10px;
                    font-size: 14px;
                }
            }
        `;
    }

    getButtons() {
        return `
            <a href="https://www.juridicaenlinea.co" class="custom-button" target="_blank">
                Regístrese
            </a>
            <a href="https://www.juridicaenlinea.co" class="custom-button" target="_blank">
                Llamar a JULI
            </a>
        `;
    }

    getFooter(lead) {
        return `
            <div class="footer">
                <img src="cid:logo1.png" alt="Logo Jurídica">
                <p>Disfruta de una mejor experiencia desde nuestra app</p>
                <div class="app-links">
                    <img src="cid:google.png" alt="Google Play">
                    <img src="cid:app.png" alt="App Store">
                </div>
                <p>Este correo ha sido enviado para ${lead.email}</p>
                <p>Los archivos adjuntos son únicos y exclusivos del destinatario</p>
            </div>
        `;
    }
}

module.exports = BaseEmailTemplate;