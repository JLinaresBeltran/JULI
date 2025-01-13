const app = require('./app');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Configurar el puerto
const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 Servidor iniciado
    📱 Monitor disponible en: http://localhost:${PORT}/monitor
    🔍 Health check en: http://localhost:${PORT}/health
    `);
});