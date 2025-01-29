// src/tests/documentGenerationTest.js
const path = require('path');
const fs = require('fs').promises;

// Configuración de logging simulado
const mockLogger = {
    logInfo: (...args) => console.log(...args),
    logError: (...args) => console.error(...args)
};

// Mock Services
class MockWhatsAppService {
    async sendTextMessage(to, text) {
        console.log(`📱 Mock WhatsApp mensaje enviado a ${to}:`, text);
        return { messageId: `MSG-${Date.now()}` };
    }

    async markAsRead(messageId) {
        console.log(`📱 Mock WhatsApp mensaje marcado como leído:`, messageId);
        return true;
    }
}

class MockConversationService {
    constructor() {
        this.conversations = new Map();
    }

    async getConversation(whatsappId) {
        if (!this.conversations.has(whatsappId)) {
            const conversation = {
                whatsappId,
                category: 'transporte_aereo',
                metadata: {
                    customerName: "Diana Patricia Mendoza Torres",
                    documentNumber: "51234567",
                    email: "diana.mendoza@email.com",
                    phone: whatsappId,
                    address: "Avenida 19 # 98-76, Bogotá D.C.",
                    numero_reserva: "XYZABC",
                    numero_vuelo: "AV456",
                    fecha_vuelo: "2024-02-15",
                    ruta: "BOG-MIA",
                    valor_tiquete: "2500000"
                },
                messages: [
                    {
                        type: 'text',
                        text: { body: 'Mi vuelo BOG-MIA fue cancelado sin previo aviso.' }
                    },
                    {
                        type: 'text',
                        text: { body: 'El vuelo era el AV456 para el 15 de febrero, reserva XYZABC.' }
                    },
                    {
                        type: 'text',
                        text: { body: 'Tuve que comprar otro tiquete por $3,500,000.' }
                    }
                ],
                getMessages() {
                    return this.messages.map(m => m.text.body).join('\n');
                }
            };
            this.conversations.set(whatsappId, conversation);
        }
        return this.conversations.get(whatsappId);
    }

    async updateConversationMetadata(whatsappId, metadata) {
        console.log('📝 Mock Conversation metadata actualizada:', metadata);
        const conversation = await this.getConversation(whatsappId);
        conversation.metadata = { ...conversation.metadata, ...metadata };
        return true;
    }
}

class MockLegalAgentSystem {
    async processComplaint(sector, conversation, customerData) {
        console.log('👨‍⚖️ Mock LegalAgent procesando queja:', {
            sector,
            customerName: customerData.name,
            email: customerData.email,
            phone: customerData.phone
        });

        return {
            customerName: customerData.name,
            companyName: "Avianca S.A.",
            reference: "Cancelación de Vuelo y Solicitud de Reembolso",
            hechos: [
                "El vuelo AV456 con ruta BOG-MIA programado para el 15 de febrero fue cancelado sin previo aviso.",
                "No se ofrecieron alternativas satisfactorias de viaje.",
                "El usuario incurrió en gastos adicionales por la compra de un nuevo tiquete."
            ],
            peticion: "Solicito el reembolso del valor del tiquete original y la compensación por los gastos adicionales incurridos.",
            metadata: {
                category: sector,
                customerEmail: customerData.email,
                customerPhone: customerData.phone
            }
        };
    }
}

class MockDocumentService {
    async generateDocument(serviceType, data, customerData) {
        console.log('📄 Mock DocumentService generando documento para:', {
            customerName: customerData.name,
            serviceType,
            documentType: data.reference
        });
        
        const mockDoc = {
            sections: [{
                properties: {},
                children: [
                    { text: "Documento de Reclamación", bold: true },
                    { text: `\nPara: ${data.companyName}` },
                    { text: `\nDe: ${customerData.name}` },
                    { text: `\nReferencia: ${data.reference}` },
                    { text: "\n\nHECHOS:" },
                    ...data.hechos.map((hecho, index) => (
                        { text: `\n${index + 1}. ${hecho}` }
                    )),
                    { text: "\n\nPETICIÓN:" },
                    { text: `\n${data.peticion}` }
                ]
            }]
        };

        return mockDoc;
    }

    async saveDocument(doc, outputPath) {
        console.log('💾 Mock DocumentService guardando documento en:', outputPath);
        return outputPath;
    }
}

class DocumentRequestHandler {
    constructor(conversationService, whatsappService, legalAgentSystem, documentService) {
        this.conversationService = conversationService;
        this.whatsappService = whatsappService;
        this.legalAgentSystem = legalAgentSystem;
        this.documentService = documentService;
        this.DOCUMENT_TRIGGER = "juli quiero el documento";
    }

    isDocumentRequest(message) {
        if (message.type !== 'text') return false;
        const normalizedText = message.text.body.toLowerCase().trim();
        return normalizedText.includes(this.DOCUMENT_TRIGGER);
    }

    async handleDocumentRequest(message, conversation) {
        try {
            mockLogger.logInfo('Procesando solicitud de documento', {
                whatsappId: message.from,
                category: conversation?.category
            });

            if (!conversation?.category) {
                await this.whatsappService.sendTextMessage(
                    message.from,
                    "Para generar el documento, primero necesito que me cuentes tu caso."
                );
                return { success: false, reason: 'NO_CATEGORY' };
            }

            await this.whatsappService.sendTextMessage(
                message.from,
                "Estoy procesando tu solicitud para generar el documento legal..."
            );

            const customerData = {
                name: conversation.metadata.customerName,
                email: conversation.metadata.email,
                phone: conversation.metadata.phone,
                documentNumber: conversation.metadata.documentNumber,
                address: conversation.metadata.address,
                ...conversation.metadata
            };

            const result = await this.legalAgentSystem.processComplaint(
                conversation.category,
                conversation.getMessages(),
                customerData
            );

            const doc = await this.documentService.generateDocument(
                conversation.category,
                result,
                customerData
            );

            await this.whatsappService.sendTextMessage(
                message.from,
                "¡Tu documento ha sido generado exitosamente! Te lo enviaré por correo electrónico."
            );

            await this.conversationService.updateConversationMetadata(
                message.from,
                {
                    documentGenerated: true,
                    documentGeneratedAt: new Date().toISOString(),
                    documentReference: doc.sections[0].children[0].text
                }
            );

            return { 
                success: true, 
                type: 'DOCUMENT_GENERATED', 
                document: doc,
                metadata: {
                    timestamp: new Date().toISOString(),
                    category: conversation.category,
                    customerEmail: conversation.metadata.email
                }
            };

        } catch (error) {
            mockLogger.logError('Error en document request handler', {
                error: error.message,
                whatsappId: message.from
            });

            await this.whatsappService.sendTextMessage(
                message.from,
                "Lo siento, hubo un error procesando tu solicitud. Por favor, intenta nuevamente."
            );

            return { success: false, reason: 'PROCESSING_ERROR', error };
        }
    }
}

async function testDocumentGenerationFlow() {
    try {
        console.log('🚀 Iniciando prueba de flujo de generación de documentos');

        // Configurar directorio de salida
        const outputDir = path.join(__dirname, '../output');
        await fs.mkdir(outputDir, { recursive: true });

        // Instanciar servicios mockeados
        const whatsappService = new MockWhatsAppService();
        const conversationService = new MockConversationService();
        const legalAgentSystem = new MockLegalAgentSystem();
        const documentService = new MockDocumentService();

        // Crear handler de documentos
        const documentHandler = new DocumentRequestHandler(
            conversationService,
            whatsappService,
            legalAgentSystem,
            documentService
        );

        // Simular mensaje de solicitud de documento
        const mockMessage = {
            id: `msg_${Date.now()}`,
            from: '573201234567',
            timestamp: Date.now(),
            type: 'text',
            text: {
                body: 'juli quiero el documento'
            }
        };

        console.log('\n📨 Verificando si es solicitud de documento...');
        const isDocRequest = documentHandler.isDocumentRequest(mockMessage);
        console.log('🔍 ¿Es solicitud de documento?:', isDocRequest);

        // Validar detección de solicitud
        if (!isDocRequest) {
            throw new Error('❌ Error: No se detectó correctamente la solicitud de documento');
        }

        // Obtener conversación
        console.log('\n🔄 Recuperando conversación...');
        const conversation = await conversationService.getConversation(mockMessage.from);
        
        // Validar datos de la conversación
        if (!conversation || !conversation.category || !conversation.metadata.customerName) {
            throw new Error('❌ Error: Datos de conversación incompletos o inválidos');
        }

        console.log('👥 Datos de la conversación:', {
            category: conversation.category,
            messageCount: conversation.messages.length,
            customerName: conversation.metadata.customerName
        });

        // Procesar solicitud de documento
        console.log('\n📝 Procesando solicitud de documento...');
        const result = await documentHandler.handleDocumentRequest(mockMessage, conversation);

        // Validar resultado del procesamiento
        if (!result.success || !result.document) {
            throw new Error('❌ Error: Fallo en la generación del documento');
        }

        // Validar estructura del documento
        const documentContent = result.document.sections[0].children;
        if (!documentContent || documentContent.length === 0) {
            throw new Error('❌ Error: Documento generado sin contenido');
        }

        // Guardar resultado para verificación
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultPath = path.join(outputDir, `document_generation_test_${timestamp}.json`);
        
        const fullResult = {
            ...result,
            testMetadata: {
                timestamp,
                conversationId: mockMessage.from,
                customerData: {
                    name: conversation.metadata.customerName,
                    email: conversation.metadata.email,
                    phone: conversation.metadata.phone
                },
                category: conversation.category,
                validations: {
                    documentGenerated: true,
                    contentValid: documentContent.length > 0,
                    hasMetadata: !!result.metadata
                }
            }
        };
        
        await fs.writeFile(resultPath, JSON.stringify(fullResult, null, 2));

        console.log('\n📋 Resultado del procesamiento:', {
            success: result.success,
            type: result.type,
            documentGenerated: !!result.document,
            contentSections: documentContent.length,
            resultPath
        });

        // Verificar el estado final de la conversación
        const finalConversation = await conversationService.getConversation(mockMessage.from);
        
        // Validar estado final
        if (!finalConversation.metadata.documentGenerated || 
            !finalConversation.metadata.documentGeneratedAt ||
            !finalConversation.metadata.documentReference) {
            throw new Error('❌ Error: Metadatos de conversación no actualizados correctamente');
        }

        console.log('\n🔍 Estado final de la conversación:', {
            documentGenerated: finalConversation.metadata.documentGenerated,
            documentGeneratedAt: finalConversation.metadata.documentGeneratedAt,
            documentReference: finalConversation.metadata.documentReference
        });

        console.log('\n✅ Todas las validaciones completadas exitosamente');
        return result;

    } catch (error) {
        console.error('\n💥 Error durante la prueba:', error.message);
        throw error;
    }
}

// Ejecutar prueba
console.log('🏃 Iniciando sistema de pruebas...');
testDocumentGenerationFlow()
    .then(() => console.log('\n✨ Prueba completada exitosamente'))
    .catch(error => {
        console.error('\n💥 Error en la prueba:', error);
        process.exit(1);
    });