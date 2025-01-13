// src/server.js
const { app, server } = require('./app');
const { logInfo, logError } = require('./utils/logger');

// Configuración principal
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Función para obtener la URL base correcta
const getBaseUrl = () => {
    if (process.env.HEROKU_APP_NAME) {
        return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    }
    return process.env.APP_URL || `http://localhost:${PORT}`;
};

// Iniciar el servidor
server.listen(PORT, HOST, () => {
    const baseUrl = getBaseUrl();
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    
    logInfo('\n=== JULI Server Started ===');
    logInfo(`📍 Host: ${HOST}`);
    logInfo(`🔌 Port: ${PORT}`);
    logInfo(`📱 Monitor: ${baseUrl}/monitor`);
    logInfo(`🔍 Health: ${baseUrl}/health`);
    logInfo(`🌐 WebSocket: ${wsUrl}/ws`);
    logInfo(`⚙️ Environment: ${process.env.NODE_ENV}`);
    logInfo(`🔒 SSL: ${baseUrl.startsWith('https')}`);
    logInfo('========================\n');
});

// Manejo de errores del servidor
server.on('error', (error) => {
    logError('Error crítico en el servidor:', {
        error: error.message,
        stack: error.stack,
        code: error.code
    });
    
    // Cerrar el servidor de forma segura
    try {
        server.close(() => {
            logInfo('Servidor cerrado debido a error crítico');
            process.exit(1);
        });
    } catch (closeError) {
        logError('Error al cerrar el servidor:', closeError);
        process.exit(1);
    }
});

// Manejo de señales de terminación
const handleShutdown = (signal) => {
    logInfo(`Señal ${signal} recibida. Iniciando apagado graceful...`);
    
    // Establecer un timeout para forzar el cierre si toma demasiado tiempo
    const forceExit = setTimeout(() => {
        logError('Forzando cierre después de timeout');
        process.exit(1);
    }, 10000); // 10 segundos de timeout
    
    server.close(() => {
        clearTimeout(forceExit);
        logInfo(`Servidor cerrado exitosamente después de señal ${signal}`);
        process.exit(0);
    });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Manejo de excepciones no capturadas
process.on('uncaughtException', (error) => {
    logError('Error no capturado:', {
        error: error.message,
        stack: error.stack,
        type: error.name
    });
    
    handleShutdown('UNCAUGHT_EXCEPTION');
});

// Manejo de promesas rechazadas no capturadas
process.on('unhandledRejection', (reason, promise) => {
    logError('Promesa rechazada no manejada:', {
        reason: reason instanceof Error ? reason.stack : reason,
        promise: promise
    });
    
    handleShutdown('UNHANDLED_REJECTION');
});

// Logging de uso de memoria cada 5 minutos
if (process.env.NODE_ENV === 'production') {
    setInterval(() => {
        const used = process.memoryUsage();
        logInfo('Uso de memoria:', {
            rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(used.external / 1024 / 1024)}MB`
        });
    }, 300000); // 5 minutos
}

// Verificar variables de entorno críticas
const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'APP_URL',
    'CHATBASE_API_KEY',
    'OPENAI_API_KEY'
];

requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
        logError(`Variable de entorno requerida no encontrada: ${envVar}`);
        process.exit(1);
    }
});

// Exportar para testing
module.exports = server;