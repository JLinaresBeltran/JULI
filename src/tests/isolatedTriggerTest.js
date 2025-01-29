// src/tests/isolatedTriggerTest.js
const fs = require('fs').promises;
const path = require('path');

// Mock del LegalAgentSystem
class MockLegalAgentSystem {
    async processComplaint(category, conversation, customerData) {
        // Simular el procesamiento basado en la categoría
        const responses = {
            'telecomunicaciones': {
                hechos: [
                    "El usuario reporta problemas con el servicio de internet contratado.",
                    "La velocidad del servicio no corresponde a lo acordado en el contrato.",
                    "Se han realizado múltiples reportes sin obtener solución."
                ],
                peticion: "Solicito la revisión técnica del servicio y el ajuste de la facturación de acuerdo al servicio realmente prestado."
            },
            'servicios_publicos': {
                hechos: [
                    "Se reporta un cobro excesivo en la factura del servicio.",
                    "El consumo facturado no corresponde al histórico normal.",
                    "No se han detectado fugas o causas que justifiquen el incremento."
                ],
                peticion: "Solicito la revisión y ajuste de la factura de acuerdo al consumo histórico normal."
            },
            'transporte_aereo': {
                hechos: [
                    "Se presentó cancelación del vuelo sin previo aviso.",
                    "No se ofrecieron alternativas de transporte satisfactorias.",
                    "El usuario incurrió en gastos adicionales."
                ],
                peticion: "Solicito el reembolso del valor del tiquete y la compensación por los gastos adicionales."
            }
        };

        // Obtener respuesta según categoría o usar respuesta genérica
        const response = responses[category] || {
            hechos: ["Descripción general del problema reportado."],
            peticion: "Solicitud de revisión y solución del caso."
        };

        return {
            customerName: customerData.name,
            companyName: this._getCompanyName(category),
            reference: `Reclamación - ${category}`,
            hechos: response.hechos,
            peticion: response.peticion,
            metadata: {
                category,
                timestamp: new Date().toISOString(),
                version: "1.0"
            }
        };
    }

    _getCompanyName(category) {
        const companies = {
            'telecomunicaciones': 'Empresa de Telecomunicaciones',
            'servicios_publicos': 'Empresa de Servicios Públicos',
            'transporte_aereo': 'Aerolínea'
        };
        return companies[category] || 'Empresa de Servicios';
    }
}

// Sistema de pruebas con mock completo
class TriggerTestSystem {
    constructor() {
        this.legalAgent = new MockLegalAgentSystem();
        this.triggerWords = [
            "generar",
            "documento",
            "generar documento",
            "necesito documento",
            "quiero documento"
        ];
    }

    detectTrigger(message) {
        const normalizedText = message.toLowerCase().trim();
        return this.triggerWords.some(trigger => 
            normalizedText.includes(trigger.toLowerCase())
        );
    }

    async processMessage(message, userData, category) {
        console.log(`\n🔍 Analizando mensaje: "${message}"`);

        if (this.detectTrigger(message)) {
            console.log('✅ Trigger detectado');
            return await this.handleTrigger(message, userData, category);
        }

        console.log('❌ No se detectó trigger');
        return null;
    }

    async handleTrigger(message, userData, category) {
        try {
            console.log('\n📝 Iniciando proceso de generación de documento');
            console.log('Categoría:', category);
            console.log('Usuario:', userData.name);

            const conversationText = `
            Usuario: ${message}
            JULI: ¿Me puedes dar más detalles de tu caso?
            Usuario: ${userData.details || 'Tengo problemas con el servicio'}
            JULI: ¿Hace cuánto tienes este inconveniente?
            Usuario: ${userData.timeframe || 'Hace una semana'}
            `;

            const result = await this.legalAgent.processComplaint(
                category,
                conversationText,
                userData
            );

            return result;

        } catch (error) {
            console.error('Error procesando trigger:', error);
            throw error;
        }
    }

    async saveResult(result) {
        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `isolated_test_${timestamp}.json`);
        
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        return outputPath;
    }
}

// Función principal de prueba
async function runIsolatedTest() {
    try {
        console.log('🚀 Iniciando prueba aislada de sistema de triggers\n');
        const testSystem = new TriggerTestSystem();

        // Casos de prueba
        const testCases = [
            {
                message: "Hola, quiero generar un documento por mi internet lento",
                userData: {
                    name: "Carlos Test",
                    id: "79876543",
                    email: "test@email.com",
                    phone: "3201234567",
                    address: "Calle Test # 1-23",
                    numero_linea: "TEL789012",
                    tipo_servicio: "Internet Fibra Óptica",
                    plan_contratado: "Plan Hogar 300MB",
                    details: "Mi internet es muy lento y se cae constantemente",
                    timeframe: "Hace dos semanas"
                },
                category: 'telecomunicaciones'
            },
            {
                message: "Buenos días, mi factura llegó muy alta",
                userData: {
                    name: "Ana Test",
                    id: "51234567",
                    email: "ana.test@email.com",
                    phone: "3157894561",
                    address: "Av Test # 45-67",
                    cuenta_contrato: "12345678",
                    tipo_servicio: "Acueducto",
                    details: "Mi factura llegó muy alta este mes",
                    timeframe: "Este mes"
                },
                category: 'servicios_publicos'
            },
            {
                message: "Necesito generar un documento por mi vuelo cancelado",
                userData: {
                    name: "Luis Test",
                    id: "80123456",
                    email: "luis.test@email.com",
                    phone: "3501234567",
                    address: "Cr Test # 89-12",
                    numero_vuelo: "AV123",
                    ruta: "BOG-MDE",
                    details: "Cancelaron mi vuelo sin previo aviso",
                    timeframe: "Ayer"
                },
                category: 'transporte_aereo'
            }
        ];

        // Ejecutar casos de prueba
        console.log(`📋 Ejecutando ${testCases.length} casos de prueba...\n`);

        for (const [index, testCase] of testCases.entries()) {
            console.log(`\n🔄 Caso de prueba #${index + 1}:`);
            console.log('=====================================');
            
            const result = await testSystem.processMessage(
                testCase.message,
                testCase.userData,
                testCase.category
            );

            if (result) {
                const outputPath = await testSystem.saveResult(result);
                console.log('\n📋 Resultado:', {
                    customerName: result.customerName,
                    companyName: result.companyName,
                    hechos: result.hechos.length,
                    outputPath
                });
            }
        }

        console.log('\n✨ Prueba completada exitosamente');

    } catch (error) {
        console.error('\n💥 Error en la prueba:', error);
        throw error;
    }
}

// Ejecutar prueba
console.log('🏃 Iniciando sistema de pruebas...');
runIsolatedTest()
    .then(() => console.log('✅ Proceso finalizado'))
    .catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
    });