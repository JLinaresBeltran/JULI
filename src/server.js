// src/server.js
const { app } = require('./app');
const WebSocketManager = require('./services/websocketService');
const { logInfo, logError } = require('./utils/logger');
const http = require('http');

class JuliServer {
    constructor() {
        this.PORT = process.env.PORT || 3000;
        this.HOST = '0.0.0.0';
        this.server = http.createServer(app);
        this.wsManager = null;
        this.shutdownTimeout = 10000; // 10 segundos
        this.memoryCheckInterval = 300000; // 5 minutos
        this.requiredEnvVars = [
            'NODE_ENV',
            'PORT',
            'APP_URL',
            'CHATBASE_API_KEY',
            'OPENAI_API_KEY'
        ];
    }

    getBaseUrl() {
        if (process.env.HEROKU_APP_NAME) {
            return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
        }
        return process.env.APP_URL || `http://localhost:${this.PORT}`;
    }

    validateEnvironment() {
        this.requiredEnvVars.forEach(envVar => {
            if (!process.env[envVar]) {
                throw new Error(`Variable de entorno requerida no encontrada: ${envVar}`);
            }
        });
    }

    setupWebSocket() {
        this.wsManager = new WebSocketManager(this.server);
        
        // Configurar broadcast periódico de estado
        setInterval(() => {
            const stats = this.wsManager.getStats();
            this.wsManager.broadcast({
                type: 'status',
                data: stats
            });
        }, 30000);
    }

    setupErrorHandling() {
        this.server.on('error', (error) => {
            logError('Error crítico en el servidor:', {
                error: error.message,
                stack: error.stack,
                code: error.code
            });
            this.shutdown('SERVER_ERROR');
        });

        process.on('uncaughtException', (error) => {
            logError('Error no capturado:', {
                error: error.message,
                stack: error.stack,
                type: error.name
            });
            this.shutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            logError('Promesa rechazada no manejada:', {
                reason: reason instanceof Error ? reason.stack : reason,
                promise: promise
            });
            this.shutdown('UNHANDLED_REJECTION');
        });

        ['SIGTERM', 'SIGINT'].forEach(signal => {
            process.on(signal, () => this.shutdown(signal));
        });
    }

    setupMemoryMonitoring() {
        if (process.env.NODE_ENV === 'production') {
            setInterval(() => {
                const used = process.memoryUsage();
                logInfo('Uso de memoria:', {
                    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
                    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
                    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
                    external: `${Math.round(used.external / 1024 / 1024)}MB`,
                    timestamp: new Date().toISOString()
                });
            }, this.memoryCheckInterval);
        }
    }

    async shutdown(signal) {
        logInfo(`Señal ${signal} recibida. Iniciando apagado graceful...`);
        
        // Notificar a los clientes WebSocket
        if (this.wsManager) {
            this.wsManager.broadcast({
                type: 'shutdown',
                data: { message: 'Server shutting down...' }
            });
        }

        const forceExit = setTimeout(() => {
            logError('Forzando cierre después de timeout');
            process.exit(1);
        }, this.shutdownTimeout);

        try {
            // Cerrar WebSocket primero
            if (this.wsManager) {
                await this.wsManager.close();
            }

            // Cerrar servidor HTTP
            await new Promise((resolve, reject) => {
                this.server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            clearTimeout(forceExit);
            logInfo(`Servidor cerrado exitosamente después de señal ${signal}`);
            process.exit(0);
        } catch (error) {
            logError('Error durante el shutdown:', error);
            clearTimeout(forceExit);
            process.exit(1);
        }
    }

    logServerInfo() {
        const baseUrl = this.getBaseUrl();
        const wsUrl = baseUrl.replace(/^http/, 'ws');
        
        logInfo('\n=== JULI Server Started ===');
        logInfo(`📍 Host: ${this.HOST}`);
        logInfo(`🔌 Port: ${this.PORT}`);
        logInfo(`📱 Monitor: ${baseUrl}/monitor`);
        logInfo(`🔍 Health: ${baseUrl}/health`);
        logInfo(`🌐 WebSocket: ${wsUrl}/ws`);
        logInfo(`⚙️ Environment: ${process.env.NODE_ENV}`);
        logInfo(`🔒 SSL: ${baseUrl.startsWith('https')}`);
        logInfo('========================\n');
    }

    async start() {
        try {
            this.validateEnvironment();
            this.setupErrorHandling();
            this.setupMemoryMonitoring();
            this.setupWebSocket();

            await new Promise((resolve) => {
                this.server.listen(this.PORT, this.HOST, resolve);
            });

            this.logServerInfo();
        } catch (error) {
            logError('Error iniciando servidor:', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }

    getServer() {
        return this.server;
    }

    getWebSocketManager() {
        return this.wsManager;
    }
}

// Crear y arrancar el servidor
const juliServer = new JuliServer();
juliServer.start();

// Exportar para testing y referencia
module.exports = {
    juliServer,
    server: juliServer.getServer(),
    wsManager: juliServer.getWebSocketManager()
};