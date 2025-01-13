// src/tests/email/transporteAereoEmailTest.js
const emailService = require('../../services/email/emailService');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

dotenv.config();

async function testTransporteAereoEmail() {
    try {
        console.log('🚀 Iniciando prueba de envío de correo para Transporte Aéreo...');

        const mockLead = {
            name: "Patricia Sánchez Ramírez",
            email: process.env.TEST_EMAIL || "test@example.com",
            phone: "310 987 6543",
            documentNumber: "51.789.123",
            address: "Avenida 19 # 98-76, Bogotá D.C."
        };

        const tempDir = path.join(__dirname, '../temp');
        await fs.mkdir(tempDir, { recursive: true });

        const mockDocumentPath = path.join(tempDir, 'test-documento.docx');
        await fs.writeFile(mockDocumentPath, 'Contenido de prueba del documento');

        console.log('📧 Enviando correo de prueba...');
        const result = await emailService.sendDocumentEmail(
            mockLead,
            mockDocumentPath,
            'transporte_aereo'
        );

        console.log('✅ Correo enviado exitosamente');
        console.log('📋 Detalles del envío:');
        console.log('- Destinatario:', result.to);
        console.log('- ID del mensaje:', result.messageId);
        console.log('- Timestamp:', result.timestamp);

        await fs.unlink(mockDocumentPath);
        console.log('🧹 Archivos temporales eliminados');

    } catch (error) {
        console.error('❌ Error durante la prueba:', error);
        throw error;
    }
}

console.log('🏃 Iniciando prueba...');
testTransporteAereoEmail()
    .then(() => {
        console.log('✨ Prueba completada exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });