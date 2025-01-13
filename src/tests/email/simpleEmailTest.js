// src/tests/email/simpleEmailTest.js
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

// Cargar variables de entorno
const envPath = path.resolve(__dirname, '../../../.env');
console.log('📁 Cargando variables de entorno desde:', envPath);

const result = dotenv.config({ path: envPath });
if (result.error) {
    console.error('❌ Error cargando .env:', result.error);
    process.exit(1);
}

console.log('✅ Variables de entorno cargadas');
console.log('📧 Configuración SMTP:');
console.log('- Host:', process.env.SMTP_HOST);
console.log('- Puerto:', process.env.SMTP_PORT);
console.log('- Usuario:', process.env.SMTP_USER);
console.log('- From:', process.env.SMTP_FROM);

// Importar el servicio de email
const emailService = require('../../services/email/emailService');

async function runTest() {
    try {
        console.log('\n🔍 Verificando configuración de email...');
        await emailService.validateConfig();
        console.log('✅ Configuración válida');

        // Crear archivo temporal de prueba
        const tempDir = path.join(__dirname, '../temp');
        await fs.mkdir(tempDir, { recursive: true });
        const testFilePath = path.join(tempDir, 'test.docx');
        await fs.writeFile(testFilePath, 'Contenido de prueba');
        console.log('📄 Archivo de prueba creado:', testFilePath);

        console.log('\n📧 Enviando email de prueba...');
        const result = await emailService.sendEmail(
            {
                name: "Usuario de Prueba",
                email: process.env.TEST_EMAIL,
            },
            testFilePath,
            'test'
        );

        console.log('\n✅ Email enviado exitosamente');
        console.log('Detalles:', result);

        // Limpiar
        await fs.unlink(testFilePath);
        console.log('\n🧹 Archivo temporal eliminado');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

// Ejecutar prueba
console.log('🚀 Iniciando prueba de email...');
runTest()
    .then(() => {
        console.log('\n✨ Prueba completada exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Error en la prueba:', error);
        process.exit(1);
    });