// Archivo documentService.js (services/documentService.js)
const docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const generateDocument = async (templateName, data) => {
    try {
        // Cargar plantilla desde la carpeta templates
        const templatePath = path.resolve(__dirname, '../templates', `${templateName}.docx`);
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        // Reemplazar variables en la plantilla con los datos proporcionados
        doc.render(data);

        // Generar el archivo de salida
        const buffer = doc.getZip().generate({ type: 'nodebuffer' });
        const outputPath = path.resolve(__dirname, '../output', `${Date.now()}_${templateName}.docx`);
        fs.writeFileSync(outputPath, buffer);

        console.log('Document generated:', outputPath);
        return outputPath;
    } catch (error) {
        console.error('Error generating document:', error);
        throw error;
    }
};

module.exports = { generateDocument };