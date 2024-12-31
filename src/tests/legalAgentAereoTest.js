const LegalAgentSystem = require('../services/legalAgents');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testAgenteTransporteAereo() {
    try {
        console.log('🚀 Iniciando prueba del sistema de agentes legales - Transporte Aéreo');

        const userInput = {
            conversation: `
            Usuario: Mi vuelo BOG-MIA fue cancelado sin previo aviso y no me han dado solución.
            JULI: ¿Me puedes proporcionar los detalles de tu vuelo?
            Usuario: El vuelo era el AV456 para el 15 de febrero, reserva XYZABC. Llegué al aeropuerto y me dijeron que estaba cancelado por razones operativas.
            JULI: ¿Qué alternativas te ofrecieron?
            Usuario: Ninguna, solo me dijeron que me reprogramarían en 3 días. Tuve que comprar un tiquete con otra aerolínea por $3,500,000 cuando el original me costó $2,500,000.
            Usuario: Ya puse una queja con número de radicado AIR98765 pero no he recibido respuesta.`,

            customerData: {
                name: "Diana Patricia Mendoza Torres",
                id: "51234567",
                email: "diana.mendoza@email.com",
                phone: "3154567890",
                address: "Avenida 19 # 98-76, Bogotá D.C.",
                numero_reserva: "XYZABC",
                numero_vuelo: "AV456",
                fecha_vuelo: "2024-02-15",
                ruta: "BOG-MIA",
                valor_tiquete: "2500000"
            }
        };

        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        console.log('📝 Inicializando sistema de agentes legales...');
        const system = new LegalAgentSystem();

        console.log('⚙️ Procesando queja...');
        const result = await system.processComplaint(
            'transporte_aereo',
            userInput.conversation,
            userInput.customerData
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `resultado_agente_aereo_${timestamp}.json`);
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

        console.log('\n📋 Resumen del procesamiento:');
        console.log('Usuario:', result.customerName);
        console.log('Empresa:', result.companyName);
        console.log('Referencia:', result.reference);
        
        console.log('\nHechos:');
        result.hechos.forEach((hecho, index) => {
            console.log(`${index + 1}. ${hecho}`);
        });
        
        console.log('\nPetición:');
        console.log(result.peticion);

        console.log('\n✅ Resultado guardado en:', outputPath);

    } catch (error) {
        console.error('❌ Error durante la prueba:', error);
        throw error;
    }
}

console.log('🏃 Iniciando prueba...');
testAgenteTransporteAereo()
    .then(() => console.log('✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });