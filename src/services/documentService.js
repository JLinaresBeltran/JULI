// src/services/documentService.js
const { Document, Paragraph, TextRun, AlignmentType, Packer } = require('docx');
const fs = require('fs').promises;
const path = require('path');
const templates = require('../templates');

class DocumentService {
    constructor() {
        // Configuración de texto por defecto
        this.defaultTextProperties = {
            font: "Calibri Light",
            size: 28, // 14pt
        };

        // Configuración de párrafo por defecto
        this.defaultParagraphProperties = {
            spacing: { 
                line: 240,  // Interlineado sencillo (1.0)
                after: 0    // Sin espacio después del párrafo por defecto
            }
        };
    }

    async generateDocument(serviceType, userData, langchainData, serviceData) {
        try {
            const template = templates.getTemplateById(serviceType);
            if (!template) {
                throw new Error(`Tipo de servicio no válido: ${serviceType}`);
            }

            this.validateData(template, userData, langchainData, serviceData);

            const allData = {
                ...userData,
                ...langchainData,
                ...serviceData
            };

            const doc = await this.createDocument(template, allData);
            return doc;

        } catch (error) {
            console.error('Error en generateDocument:', error);
            throw error;
        }
    }

    validateData(template, userData, langchainData, serviceData) {
        // Validar datos del usuario
        const requiredUserFields = ['customerName', 'documentNumber', 'email', 'phone', 'address'];
        for (const field of requiredUserFields) {
            if (!userData[field]) {
                throw new Error(`Campo requerido faltante en userData: ${field}`);
            }
        }

        // Validar datos de LangChain
        if (!langchainData.hechos || !langchainData.peticion) {
            throw new Error('Datos requeridos faltantes en langchainData: hechos y/o peticion');
        }

        // Validar datos específicos del servicio
        if (template.required_fields) {
            for (const field of template.required_fields) {
                if (!serviceData[field]) {
                    throw new Error(`Campo requerido faltante en serviceData: ${field}`);
                }
            }
        }
    }

    async createDocument(template, data) {
        try {
            const doc = new Document({
                sections: [{
                    properties: {},
                    children: [
                        // "Señores"
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Señores",
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            ...this.defaultParagraphProperties,
                        }),

                        // Nombre de la empresa en negrita
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: data.companyName || template.companyType,
                                    bold: true,
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            ...this.defaultParagraphProperties,
                        }),

                        // Tipo de empresa
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: template.companyType,
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, after: 240 }
                        }),

                        // Referencia
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Referencia: ",
                                    bold: true,
                                    ...this.defaultTextProperties,
                                }),
                                new TextRun({
                                    text: data.reference || "Reclamación de servicios",
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, after: 240 }
                        }),

                        // Saludo
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Respetados Señores:",
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, after: 240 }
                        }),

                        // Introducción
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `${data.customerName}, `,
                                    bold: true,
                                    ...this.defaultTextProperties,
                                }),
                                new TextRun({
                                    text: "identificado con cédula de ciudadanía número ",
                                    ...this.defaultTextProperties,
                                }),
                                new TextRun({
                                    text: data.documentNumber,
                                    bold: true,
                                    ...this.defaultTextProperties,
                                }),
                                new TextRun({
                                    text: `, en mi calidad de usuario, me dirijo a ustedes para presentar una reclamación en los términos de la ${template.regulation}. Los hechos que motivan mi reclamación son los siguientes:`,
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            alignment: AlignmentType.JUSTIFIED,
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, after: 240 }
                        }),

                        // HECHOS
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "HECHOS",
                                    bold: true,
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, before: 240, after: 240 }
                        }),

                        ...this.generateHechos(data.hechos),

                        // PETICIÓN
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "PETICIÓN",
                                    bold: true,
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, before: 240, after: 240 }
                        }),

                        // Texto de la petición
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: data.peticion,
                                    ...this.defaultTextProperties,
                                }),
                            ],
                            alignment: AlignmentType.JUSTIFIED,
                            ...this.defaultParagraphProperties,
                            spacing: { ...this.defaultParagraphProperties.spacing, after: 240 }
                        }),

                        ...this.generateNotificationsAndSignature(data),
                    ],
                }],
            });

            return doc;
        } catch (error) {
            console.error('Error en createDocument:', error);
            throw error;
        }
    }

    generateHechos(hechos) {
        if (!Array.isArray(hechos)) {
            hechos = [hechos];
        }

        return hechos.map((hecho, index) => 
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${index + 1}. `,
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: hecho,
                        ...this.defaultTextProperties,
                    }),
                ],
                alignment: AlignmentType.JUSTIFIED,
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, after: 120 }
            })
        );
    }

    generateNotificationsAndSignature(data) {
        return [
            // NOTIFICACIONES
            new Paragraph({
                children: [
                    new TextRun({
                        text: "NOTIFICACIONES",
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                ],
                alignment: AlignmentType.CENTER,
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, before: 240, after: 240 }
            }),

            // Texto de notificaciones
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Para efectos de notificaciones y demás comunicaciones relacionadas con el presente trámite, solicito que se me notifique tanto de forma física en mi dirección ",
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: data.address,
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: ", y en mi correo electrónico ",
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: data.email,
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: ". Adicionalmente, pueden contactarme en mi teléfono celular ",
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: data.phone,
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: " para enterarme de la respuesta.",
                        ...this.defaultTextProperties,
                    }),
                ],
                alignment: AlignmentType.JUSTIFIED,
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, after: 240 }
            }),

            // Despedida
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Agradezco su atención y quedaré atento a su pronta y oportuna respuesta.",
                        ...this.defaultTextProperties,
                    }),
                ],
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, after: 360 }
            }),

            // Atentamente
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Atentamente,",
                        ...this.defaultTextProperties,
                    }),
                ],
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, after: 360 }
            }),

            // Línea de firma
            new Paragraph({
                children: [
                    new TextRun({
                        text: "__________________________",
                        ...this.defaultTextProperties,
                    }),
                ],
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, after: 60 }
            }),

            // Nombre
            new Paragraph({
                children: [
                    new TextRun({
                        text: data.customerName,
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                ],
                ...this.defaultParagraphProperties,
                spacing: { ...this.defaultParagraphProperties.spacing, after: 60 }
            }),

            // Cédula
            new Paragraph({
                children: [
                    new TextRun({
                        text: "C.C. ",
                        ...this.defaultTextProperties,
                    }),
                    new TextRun({
                        text: data.documentNumber,
                        bold: true,
                        ...this.defaultTextProperties,
                    }),
                ],
                ...this.defaultParagraphProperties
            }),
        ];
    }

    async saveDocument(doc, outputPath) {
        try {
            const buffer = await Packer.toBuffer(doc);
            await fs.writeFile(outputPath, buffer);
            return outputPath;
        } catch (error) {
            console.error('Error en saveDocument:', error);
            throw error;
        }
    }
}

module.exports = new DocumentService();