// src/server.js
const http = require('http');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
    console.log('\n🚀 Servidor iniciado');
    console.log(`📱 Monitor disponible en: https://app-juridica.herokuapp.com/monitor`);
    console.log(`🔍 Health check en: https://app-juridica.herokuapp.com/health`);
    console.log('\n');
});

// Manejo de errores del servidor
server.on('error', (error) => {
    console.error('Error en el servidor:', error);
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM recibido. Cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
    });
});