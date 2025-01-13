// src/tests/email/telecomunicacionesEmailTest.js
const emailService = require('../../services/email/emailService');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

dotenv.config();

async function testTelecomunicacionesEmail() {
    try {
        console.log('🚀 Iniciando prueba de envío de correo para Telecomunicaciones...');

        const mockLead = {
            name: "Carlos Eduardo Martínez",
            email: process.env.TEST_EMAIL || "test@example.com",
            phone: "317 123 4567",
            documentNumber: "80.123.456",
            address: "Calle 116 # 45-67, Bogotá D.C."
        };

        const tempDir = path.join(__dirname, '../temp');
        await fs.mkdir(tempDir, { recursive: true });

        const mockDocumentPath = path.join(tempDir, 'test-documento.docx');
        await fs.writeFile(mockDocumentPath, 'Contenido de prueba del documento');

        console.log('📧 Enviando correo de prueba...');
        const result = await emailService.sendDocumentEmail(
            mockLead,
            mockDocumentPath,
            'telecomunicaciones'
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
testTelecomunicacionesEmail()
    .then(() => {
        console.log('✨ Prueba completada exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });