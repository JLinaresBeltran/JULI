// src/tests/serviciosPublicosTest.js
const documentService = require('../services/documentService');
const fs = require('fs').promises;
const path = require('path');

async function testServiciosPublicos() {
    try {
        console.log('🚀 Iniciando prueba de generación de documento para Servicios Públicos...');

        // Datos del usuario (simulando datos que vendrían del perfil)
        const userData = {
            customerName: "Juan Pérez González",
            documentNumber: "79.856.789",
            email: "juan.perez@ejemplo.com",
            phone: "315 789 4567",
            address: "Calle 123 # 45-67, Bogotá D.C."
        };

        // Datos que vendrían del procesamiento de LangChain
        const langchainData = {
            hechos: [
                "El día 15 de enero de 2024 recibí la factura correspondiente al periodo de diciembre de 2023, con número 98765432.",
                "Al revisar la factura, observé un cobro excesivo en el consumo, registrando 45 metros cúbicos cuando mi promedio histórico es de 18 metros cúbicos mensuales.",
                "Realicé una revisión de las instalaciones internas y no se encontraron fugas ni daños que justifiquen este incremento.",
                "El día 16 de enero radiqué un reclamo en la línea de atención (número de radicado 987654) sin obtener una respuesta satisfactoria."
            ],
            peticion: "1. Solicito la revisión técnica del medidor para verificar su correcto funcionamiento.\n" +
                     "2. Requiero el ajuste de la factura de acuerdo con mi promedio histórico de consumo.\n" +
                     "3. Pido la aplicación del debido proceso en la investigación de la causa del incremento.\n" +
                     "4. Solicito la suspensión temporal del cobro hasta que se resuelva esta reclamación."
        };

        // Datos específicos del servicio
        const serviceData = {
            cuenta_contrato: "12345678-9",
            tipo_servicio: "Acueducto y Alcantarillado",
            direccion_servicio: "Calle 123 # 45-67, Bogotá D.C.",
            periodo_facturacion: "Diciembre 2023",
            reference: "Reclamación por consumo excesivo e irregular en la facturación",
            companyName: "EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTÁ E.S.P."
        };

        // Crear directorio de salida si no existe
        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        // Generar el documento
        const doc = await documentService.generateDocument(
            'servicios_publicos',
            userData,
            langchainData,
            serviceData
        );

        // Generar nombre de archivo con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `derecho_peticion_servicios_publicos_${timestamp}.docx`);

        // Guardar el documento
        await documentService.saveDocument(doc, outputPath);

        console.log('✅ Documento generado exitosamente');
        console.log('📄 Ruta del documento:', outputPath);
        
        // Mostrar resumen de los datos utilizados
        console.log('\n📋 Resumen de datos utilizados:');
        console.log('Usuario:', userData.customerName);
        console.log('Cuenta Contrato:', serviceData.cuenta_contrato);
        console.log('Tipo de Servicio:', serviceData.tipo_servicio);
        console.log('Número de Hechos:', langchainData.hechos.length);

    } catch (error) {
        console.error('❌ Error generando el documento:', error);
        throw error;
    }
}

// Ejecutar la prueba
console.log('🏃 Iniciando prueba...');
testServiciosPublicos()
    .then(() => console.log('✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });