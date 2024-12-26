const { generateDocx } = require('./documentService');
const fs = require('fs').promises;
const path = require('path');

(async () => {
  const sampleData = {
    customerName: "Juan Pérez",
    documentNumber: "123456789",
    address: "Calle Falsa 123, Ciudad Ejemplo",
    email: "juan.perez@example.com",
    phone: "555-1234",
    companyName: "Compañía de Telecomunicaciones S.A.",
    reference: "Reclamación por servicio no prestado",
    hechos: [
      "El día 01/01/2024 no recibí el servicio contratado.",
      "A pesar de múltiples reportes, no se resolvió el problema.",
      "Se me facturó indebidamente por el servicio no recibido."
    ],
    peticion: "Solicito la devolución de los valores cobrados indebidamente y la corrección de la factura."
  };

  const outputDir = path.resolve(__dirname, 'output');
  const outputPath = path.resolve(outputDir, 'prueba_documento.docx');

  try {
    // Crear carpeta de salida si no existe
    await fs.mkdir(outputDir, { recursive: true });

    console.log("Iniciando prueba de generación de documento...");
    await generateDocx(sampleData, outputPath);
    console.log(`Documento generado exitosamente en: ${outputPath}`);
  } catch (error) {
    console.error("Error durante la prueba de generación del documento:", error);
  }
})();
