const LegalAgentSystem = require('../services/legalAgents');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testAgenteTelecomunicaciones() {
    try {
        console.log('🚀 Iniciando prueba del sistema de agentes legales - Telecomunicaciones');

        const userInput = {
            conversation: `
            Usuario: Mi servicio de internet fibra óptica ha estado fallando constantemente. Contraté un plan de 300MB pero la velocidad apenas llega a 50MB.
            JULI: ¿Me puedes dar más información sobre tu servicio?
            Usuario: Tengo el plan hogar fibra 300MB, mi número de contrato es TEL789012. He llamado varias veces y tengo los números de ticket #T123456 y #T123457.
            JULI: ¿Has realizado pruebas de velocidad?
            Usuario: Sí, he hecho pruebas en diferentes momentos del día y nunca supera los 50MB. Además, el servicio se cae frecuentemente.
            JULI: ¿Indicame el nombre de la empresa?
            Usuario: la empresa se llama claro.`,

            customerData: {
                name: "Carlos Eduardo Ramírez López",
                id: "79876543",
                email: "carlos.ramirez@email.com",
                phone: "3201234567",
                address: "Calle 85 # 45-67, Bogotá D.C.",
                numero_linea: "TEL789012",
                tipo_servicio: "Internet Fibra Óptica",
                plan_contratado: "Plan Hogar 300MB",
                fecha_contratacion: "2023-12-01",
                numero_contrato: "TEL789012"
            }
        };

        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        console.log('📝 Inicializando sistema de agentes legales...');
        const system = new LegalAgentSystem();

        console.log('⚙️ Procesando queja...');
        const result = await system.processComplaint(
            'telecomunicaciones',
            userInput.conversation,
            userInput.customerData
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `resultado_agente_telecom_${timestamp}.json`);
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
testAgenteTelecomunicaciones()
    .then(() => console.log('✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('💥 Error en la prueba:', error);
        process.exit(1);
    });