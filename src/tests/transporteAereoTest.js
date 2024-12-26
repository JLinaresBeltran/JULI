// src/tests/transporteAereoTest.js
const documentService = require('../services/documentService');
const fs = require('fs').promises;
const path = require('path');

async function testTransporteAereo() {
    try {
        console.log('🚀 Iniciando prueba de generación de documento para Transporte Aéreo...');

        // Datos del usuario (simulando datos que vendrían del perfil)
        const userData = {
            customerName: "Carlos Eduardo Martínez López",
            documentNumber: "80.123.456",
            email: "carlos.martinez@ejemplo.com",
            phone: "310 234 5678",
            address: "Av. Calle 116 # 78-90, Bogotá D.C."
        };

        // Datos que vendrían del procesamiento de LangChain
        const langchainData = {
            hechos: [
                "El día 20 de enero de 2024 realicé la compra de un tiquete aéreo para la ruta Bogotá-Miami.",
                "El vuelo programado para el 15 de febrero de 2024 fue cancelado sin previo aviso.",
                "Al llegar al aeropuerto me informaron que el vuelo había sido cancelado por razones operativas.",
                "No se me ofreció una alternativa de vuelo inmediata ni hospedaje.",
                "Tuve que comprar un nuevo tiquete con otra aerolínea a un costo superior.",
                "La aerolínea no ha respondido mis solicitudes de reembolso del tiquete original."
            ],
            peticion: "1. Solicito el reembolso total del valor del tiquete ($2,500,000).\n" +
                     "2. Requiero la compensación por los gastos adicionales incurridos.\n" +
                     "3. Exijo el pago de los perjuicios causados por la cancelación sin previo aviso.\n" +
                     "4. Solicito la diferencia en el valor del nuevo tiquete que tuve que adquirir."
        };

        // Datos específicos del servicio
        const serviceData = {
            numero_reserva: "XYZABC",
            numero_vuelo: "LA1234",
            fecha_vuelo: "2024-02-15",
            ruta: "BOG-MIA",
            valor_tiquete: "2500000",
            reference: "Reclamación por cancelación de vuelo y solicitud de reembolso",
            companyName: "AEROLÍNEA COLOMBIANA S.A."
        };

        // Crear directorio de salida si no existe
        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        // Generar el documento
        const doc = await documentService.generateDocument(
            'transporte_aereo',
            userData,
            langchainData,
            serviceData
        );

        // Generar nombre de archivo con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `derecho_peticion_transporte_aereo_${timestamp}.docx`);

        // Guardar el documento
        await documentService.saveDocument(doc, outputPath);

        console.log('✅ Documento generado exitosamente');
        console.log('📄 Ruta del documento:', outputPath);
        
        // Mostrar resumen de los datos utilizados
        console.log('\n📋 Resumen de datos utilizados:');
        console.log('Usuario:', userData.customerName);
        console.log('Número de Reserva:', serviceData.numero_reserva);
        console.log('Número de Vuelo:', serviceData.numero_vuelo);
        console.log('Ruta:', serviceData.ruta);
        console.log('Valor del Tiquete:', serviceData.valor_tiquete);
        console.log('Número de Hechos:', langchainData.hechos.length);

    } catch (error) {
        console.error('❌ Error generando el documento:', error);
        throw error;
    }
}

// Ejecutar la prueba
console.log('🏃 Iniciando prueba...');
testTransporteAereo()
    .then(() => console.log('✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });