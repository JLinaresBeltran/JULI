// src/server.js
const { app, server } = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log('\n🚀 Servidor iniciado');
    console.log(`📱 Monitor disponible en: https://app-juridica.herokuapp.com/monitor`);
    console.log(`🔍 Health check en: https://app-juridica.herokuapp.com/health`);
    console.log(`🌐 WebSocket habilitado en: wss://app-juridica.herokuapp.com/ws`);
    console.log('\n');
});

// Manejo de errores del servidor
server.on('error', (error) => {
    console.error('Error en el servidor:', error);
    process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
    console.log('SIGTERM recibido. Cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
    });
});

// Manejo de otras señales de terminación
process.on('SIGINT', () => {
    console.log('SIGINT recibido. Cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
    });
});

// Manejo de excepciones no capturadas
process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
    server.close(() => {
        console.log('Servidor cerrado debido a error no capturado');
        process.exit(1);
    });
});

// Manejo de promesas rechazadas no capturadas
process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesa rechazada no manejada:', reason);
    server.close(() => {
        console.log('Servidor cerrado debido a promesa rechazada no manejada');
        process.exit(1);
    });
});