// src/tests/telecomunicacionesTest.js
const documentService = require('../services/documentService');
const fs = require('fs').promises;
const path = require('path');

async function testTelecomunicaciones() {
    try {
        console.log('🚀 Iniciando prueba de generación de documento para Telecomunicaciones...');

        // Datos del usuario (simulando datos que vendrían del perfil)
        const userData = {
            customerName: "Ana María Gómez Ramírez",
            documentNumber: "52.456.789",
            email: "ana.gomez@ejemplo.com",
            phone: "317 456 7890",
            address: "Carrera 45 # 67-89, Bogotá D.C."
        };

        // Datos que vendrían del procesamiento de LangChain
        const langchainData = {
            hechos: [
                "El día 10 de enero de 2024 contraté un plan de internet fibra óptica de 300 MB con la compañía.",
                "Desde la instalación el día 15 de enero, el servicio ha presentado interrupciones constantes.",
                "He realizado 5 reportes a la línea de atención al cliente (números de ticket: #123456, #123457, #123458).",
                "Las velocidades de conexión medidas están muy por debajo de lo contratado, alcanzando solo 50 MB.",
                "No he recibido solución efectiva a pesar de las múltiples quejas presentadas."
            ],
            peticion: "1. Solicito una revisión técnica completa de la instalación y el servicio.\n" +
                     "2. Requiero el ajuste y compensación en la factura por los días sin servicio adecuado.\n" +
                     "3. Exijo el cumplimiento de la velocidad de internet contratada (300 MB).\n" +
                     "4. Solicito la verificación del cumplimiento de los niveles de calidad del servicio ofrecidos."
        };

        // Datos específicos del servicio
        const serviceData = {
            numero_linea: "3174567890",
            tipo_servicio: "Internet Fibra Óptica",
            plan_contratado: "Internet Hogar 300 MB",
            fecha_contratacion: "2024-01-10",
            numero_contrato: "TEL-987654321",
            reference: "Reclamación por fallas en el servicio de internet y incumplimiento de velocidad contratada",
            companyName: "EMPRESA DE TELECOMUNICACIONES DE COLOMBIA S.A."
        };

        // Crear directorio de salida si no existe
        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        // Generar el documento
        const doc = await documentService.generateDocument(
            'telecomunicaciones',
            userData,
            langchainData,
            serviceData
        );

        // Generar nombre de archivo con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `derecho_peticion_telecomunicaciones_${timestamp}.docx`);

        // Guardar el documento
        await documentService.saveDocument(doc, outputPath);

        console.log('✅ Documento generado exitosamente');
        console.log('📄 Ruta del documento:', outputPath);
        
        // Mostrar resumen de los datos utilizados
        console.log('\n📋 Resumen de datos utilizados:');
        console.log('Usuario:', userData.customerName);
        console.log('Número de Línea:', serviceData.numero_linea);
        console.log('Tipo de Servicio:', serviceData.tipo_servicio);
        console.log('Plan Contratado:', serviceData.plan_contratado);
        console.log('Número de Hechos:', langchainData.hechos.length);

    } catch (error) {
        console.error('❌ Error generando el documento:', error);
        throw error;
    }
}

// Ejecutar la prueba
console.log('🏃 Iniciando prueba...');
testTelecomunicaciones()
    .then(() => console.log('✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });