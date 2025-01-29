// src/tests/whatsappTriggerTest.js

// Mock del LegalAgentSystem
class MockLegalAgentSystem {
    async processComplaint(category, conversation, customerData) {
        console.log('📝 Mock LegalAgent procesando queja para:', category);
        
        const responses = {
            'telecomunicaciones': {
                hechos: [
                    "El usuario reporta problemas con el servicio de internet.",
                    "La velocidad no corresponde a lo contratado.",
                    "Se han realizado múltiples reportes sin solución."
                ],
                peticion: "Solicito revisión técnica y ajuste del servicio"
            },
            'servicios_publicos': {
                hechos: [
                    "Se reporta cobro excesivo en la factura.",
                    "El consumo facturado no corresponde al histórico.",
                    "No se evidencian fugas o daños."
                ],
                peticion: "Solicito revisión y ajuste de la factura"
            },
            'transporte_aereo': {
                hechos: [
                    "Cancelación del vuelo sin previo aviso.",
                    "No se ofrecieron alternativas satisfactorias.",
                    "Se generaron gastos adicionales."
                ],
                peticion: "Solicito reembolso y compensación"
            }
        };

        const response = responses[category] || {
            hechos: ["Descripción del problema reportado."],
            peticion: "Solicitud de revisión del caso."
        };

        return {
            customerName: customerData.name,
            companyName: this._getCompanyName(category),
            hechos: response.hechos,
            peticion: response.peticion,
            metadata: {
                category,
                timestamp: new Date().toISOString()
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

// Mock del DocumentService
class MockDocumentService {
    async generateDocument(category, data, customerData) {
        console.log('📄 Mock DocumentService generando documento');
        return {
            success: true,
            documentId: `DOC-${Date.now()}`,
            category,
            customerEmail: customerData.email
        };
    }
}

// Mock del ConversationService
class MockConversationService {
    constructor() {
        this.conversations = new Map();
    }

    async getConversation(whatsappId) {
        if (!this.conversations.has(whatsappId)) {
            const conversation = {
                whatsappId,
                category: 'telecomunicaciones',
                metadata: {
                    email: 'test@email.com',
                    documentNumber: '123456789'
                },
                getMessages: () => [
                    {
                        type: 'text',
                        text: { body: 'Mi internet está muy lento' }
                    }
                ]
            };
            this.conversations.set(whatsappId, conversation);
        }
        return this.conversations.get(whatsappId);
    }

    async updateConversationMetadata(whatsappId, metadata) {
        console.log('📝 Actualizando metadata de conversación:', metadata);
        const conversation = await this.getConversation(whatsappId);
        conversation.metadata = { ...conversation.metadata, ...metadata };
    }

    async processIncomingMessage(message) {
        console.log('📨 Procesando mensaje entrante:', message.text?.body);
        return true;
    }
}

// Mock del WhatsAppService
class MockWhatsAppService {
    async sendTextMessage(to, text) {
        console.log(`📱 Enviando mensaje a ${to}:`, text);
        return { messageId: `MSG-${Date.now()}` };
    }
}

async function testWhatsAppTrigger() {
    try {
        console.log('🚀 Iniciando prueba de integración WhatsApp-Trigger');

        // Crear instancias de los servicios mockeados
        const conversationService = new MockConversationService();
        const whatsappService = new MockWhatsAppService();
        const legalAgentSystem = new MockLegalAgentSystem();
        const documentService = new MockDocumentService();

        // Simular mensaje de WhatsApp
        const mockMessage = {
            id: `mock_${Date.now()}`,
            from: '573201234567',
            timestamp: Date.now().toString(),
            type: 'text',
            text: {
                body: 'generar documento'
            }
        };

        // Simular contexto
        const mockContext = {
            contacts: [{
                profile: {
                    name: 'Usuario Test'
                }
            }],
            metadata: {
                display_phone_number: '573201234567',
                phone_number_id: '12345'
            }
        };

        // Importar MessageProcessor
        const MessageProcessor = require('../services/webhook/MessageProcessor');
        
        // Configurar processor
        const processor = new MessageProcessor(
            conversationService,
            whatsappService,
            null, // wsManager no necesario para la prueba
            legalAgentSystem,
            documentService
        );

        console.log('\n📱 Procesando mensaje de WhatsApp:', mockMessage.text.body);

        // Procesar mensaje
        const result = await processor.processMessage(mockMessage, mockContext);

        console.log('\n✨ Resultado del procesamiento:', result);

    } catch (error) {
        console.error('\n❌ Error durante la prueba:', error);
        throw error;
    }
}

// Ejecutar prueba
console.log('🏃 Iniciando sistema de pruebas...');
testWhatsAppTrigger()
    .then(() => console.log('\n✅ Proceso finalizado'))
    .catch(error => {
        console.error('\n💥 Error en la prueba:', error);
        process.exit(1);
    });