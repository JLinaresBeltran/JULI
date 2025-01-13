const emailService = require('../../services/email/emailService');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

// Ruta absoluta al archivo .env
const envPath = path.resolve(__dirname, '../../../.env');
console.log('Buscando archivo .env en:', envPath);

// Cargar variables de entorno
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.error('Error cargando .env:', result.error);
    process.exit(1);
}

// Mostrar configuración (sin mostrar contraseñas)
console.log('Variables de entorno cargadas:');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER ? '✓' : '✗');
console.log('SMTP_FROM:', process.env.SMTP_FROM);

async function validateEmailSetup() {
    try {
        console.log('🔍 Validando configuración de email...');
        await emailService.validateEmailConfig();
        console.log('✅ Configuración de email validada correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error validando configuración de email:', error.message);
        return false;
    }
}

async function testServiciosPublicosEmail() {
    try {
        console.log('🚀 Iniciando prueba de envío de correo para Servicios Públicos...');

        // Validar configuración primero
        const isValid = await validateEmailSetup();
        if (!isValid) {
            throw new Error('La configuración del email no es válida');
        }

        // Datos del usuario de prueba
        const mockLead = {
            name: "Ana María Gómez",
            email: process.env.TEST_EMAIL || "jhonaris8@gmail.com",
            phone: "315 789 4567",
            documentNumber: "52.456.789",
            address: "Carrera 45 # 67-89, Bogotá D.C."
        };

        // Crear directorio temporal si no existe
        const tempDir = path.join(__dirname, '../temp');
        await fs.mkdir(tempDir, { recursive: true });

        // Crear documento de prueba
        const mockDocumentPath = path.join(tempDir, 'test-documento.docx');
        await fs.writeFile(mockDocumentPath, 'Contenido de prueba del documento');

        // Enviar correo
        console.log('📧 Enviando correo de prueba...');
        console.log('Destinatario:', mockLead.email);
        
        const result = await emailService.sendDocumentEmail(
            mockLead,
            mockDocumentPath,
            'servicios_publicos'
        );

        // Mostrar resultado
        console.log('✅ Correo enviado exitosamente');
        console.log('📋 Detalles del envío:');
        console.log('- Destinatario:', result.to);
        console.log('- ID del mensaje:', result.messageId);
        console.log('- Timestamp:', result.timestamp);

        // Limpiar archivos temporales
        await fs.unlink(mockDocumentPath);
        console.log('🧹 Archivos temporales eliminados');

    } catch (error) {
        console.error('❌ Error durante la prueba:', error);
        throw error;
    }
}

// Ejecutar prueba con manejo de errores mejorado
console.log('🏃 Iniciando prueba...');
testServiciosPublicosEmail()
    .then(() => {
        console.log('✨ Prueba completada exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Error en la prueba:', {
            message: error.message,
            stack: error.stack
        });
        process.exit(1);
    });