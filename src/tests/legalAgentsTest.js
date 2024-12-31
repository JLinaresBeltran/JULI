const LegalAgentSystem = require('../services/legalAgents');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testServiciosPublicos() {
    try {
        console.log('🚀 Iniciando prueba del sistema de agentes legales - Servicios Públicos');

        const userInput = {
            conversation: `
            Usuario: Mi factura de agua llegó por $500.000 cuando normalmente pago $80.000.
            JULI: ¿Me puedes dar más información sobre tu servicio?
            Usuario: Mi cuenta contrato es 12345678, el consumo que me están cobrando es de 45m3 cuando normalmente consumo 12m3.
            JULI: ¿Has verificado si hay fugas en tu casa?
            Usuario: Sí, ya revisé y no hay fugas. Ya puse un reclamo con número RAD98765 pero no me han dado respuesta.`,

            customerData: {
                name: "Ana María González Silva",
                id: "52123456",
                email: "ana.gonzalez@email.com",
                phone: "3157894561",
                address: "Carrera 45 # 123-45, Bogotá D.C.",
                cuenta_contrato: "12345678",
                tipo_servicio: "Acueducto",
                periodo_facturacion: "Enero 2024",
                direccion_servicio: "Carrera 45 # 123-45, Bogotá D.C."
            }
        };

        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        console.log('📝 Inicializando sistema de agentes legales...');
        const system = new LegalAgentSystem();

        console.log('⚙️ Procesando queja...');
        const result = await system.processComplaint(
            'servicios_publicos',
            userInput.conversation,
            userInput.customerData
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `resultado_servicios_publicos_${timestamp}.json`);
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
testServiciosPublicos()
    .then(() => console.log('✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });