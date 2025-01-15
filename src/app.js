const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const routes = require('./routes');
const conversationService = require('./services/conversationService');
const WebSocketManager = require('./services/websocketService');
const { logInfo, logError } = require('./utils/logger');

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuración del servidor WebSocket
const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
});

const activeConnections = new Set();

// Función para enviar actualizaciones a todos los clientes conectados
const broadcastConversations = () => {
    if (activeConnections.size === 0) return;

    const conversationsMap = conversationService.activeConversations;
    const conversations = Array.from(conversationsMap.values())
        .map(conv => ({
            whatsappId: conv.whatsappId,
            userPhoneNumber: conv.userPhoneNumber,
            messages: conv.messages.map(msg => ({
                id: msg.id,
                timestamp: msg.timestamp,
                type: msg.type,
                direction: msg.direction,
                content: msg.content,
                status: msg.status
            })),
            startTime: conv.startTime,
            lastUpdateTime: conv.lastUpdateTime,
            status: conv.status,
            metadata: conv.metadata
        }));

    const message = JSON.stringify({
        type: 'conversations',
        data: conversations,
        timestamp: new Date().toISOString()
    });

    let successCount = 0;
    let errorCount = 0;

    activeConnections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
                successCount++;
            } catch (error) {
                logError('Error enviando mensaje a cliente WebSocket:', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                errorCount++;
                activeConnections.delete(client);
            }
        }
    });

    if (successCount > 0 || errorCount > 0) {
        logInfo('Estado de broadcast:', {
            totalConversations: conversations.length,
            successfulSends: successCount,
            errorSends: errorCount,
            activeConnections: activeConnections.size,
            timestamp: new Date().toISOString()
        });
    }
};

// Configuración de conexiones WebSocket
wss.on('connection', (ws, req) => {
    logInfo('Nueva conexión WebSocket establecida', {
        id: req.headers['sec-websocket-key']
    });
    
    activeConnections.add(ws);
    
    // Enviar mensaje de conexión exitosa
    ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString()
    }));
    
    // Enviar estado inicial
    broadcastConversations();
    
    // Configurar manejadores de eventos para la conversación
    const handleConversationUpdate = () => broadcastConversations();
    
    // Suscribirse a eventos
    conversationService.on('messageReceived', handleConversationUpdate);
    conversationService.on('conversationCreated', handleConversationUpdate);
    conversationService.on('conversationClosed', handleConversationUpdate);
    conversationService.on('conversationUpdated', handleConversationUpdate);
    
    // Manejar mensajes del cliente
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            logInfo('Mensaje recibido del cliente', {
                type: data.type,
                timestamp: new Date().toISOString()
            });
            
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ 
                    type: 'pong',
                    timestamp: new Date().toISOString(),
                    activeConversations: conversationService.activeConversations.size
                }));
            }
        } catch (error) {
            logError('Error procesando mensaje del cliente', {
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Función para limpiar eventos cuando se cierra la conexión
    const cleanup = () => {
        conversationService.removeListener('messageReceived', handleConversationUpdate);
        conversationService.removeListener('conversationCreated', handleConversationUpdate);
        conversationService.removeListener('conversationClosed', handleConversationUpdate);
        conversationService.removeListener('conversationUpdated', handleConversationUpdate);
    };
    
    // Manejar errores de WebSocket
    ws.on('error', (error) => {
        logError('Error en conexión WebSocket', {
            error: error.message,
            timestamp: new Date().toISOString()
        });
        activeConnections.delete(ws);
        cleanup();
    });
    
    // Limpiar recursos cuando se cierra la conexión
    ws.on('close', () => {
        logInfo('Cliente WebSocket desconectado');
        activeConnections.delete(ws);
        cleanup();
    });
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    next();
});

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Logging de requests
app.use((req, res, next) => {
    logInfo(`${req.method} ${req.path}`);
    next();
});

// Rutas principales
app.get('/', (req, res) => {
    res.status(200).send('¡Bienvenido a la API de JULI! El servidor está funcionando.');
});

app.get('/monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'conversations.html'));
});

// Ruta de depuración para estado de WebSocket
app.get('/api/debug/ws-status', (req, res) => {
    const status = {
        activeConnections: activeConnections.size,
        activeConversations: conversationService.activeConversations.size,
        wsServerStatus: wss.readyState,
        lastBroadcast: new Date().toISOString(),
        connections: Array.from(activeConnections).map(client => ({
            readyState: client.readyState,
            protocol: client.protocol,
            timestamp: new Date().toISOString()
        })),
        conversationsDetail: Array.from(conversationService.activeConversations.entries()).map(([id, conv]) => ({
            id,
            messageCount: conv.messages.length,
            lastUpdate: conv.lastUpdateTime,
            status: conv.status
        })),
        serverInfo: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        }
    };
    res.json(status);
});

// Rutas de la API
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        websocketClients: activeConnections.size,
        activeConversations: conversationService.activeConversations.size,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Manejo de errores global
app.use((err, req, res, next) => {
    logError('Error interno:', {
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method
    });
    
    res.status(500).json({
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Ha ocurrido un error',
        timestamp: new Date().toISOString()
    });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

// Manejo de apagado graceful
process.on('SIGTERM', () => {
    logInfo('Señal SIGTERM recibida. Iniciando apagado graceful...');
    
    // Notificar a los clientes WebSocket
    const shutdownMessage = JSON.stringify({
        type: 'shutdown',
        timestamp: new Date().toISOString()
    });

    let successCount = 0;
    let errorCount = 0;

    activeConnections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(shutdownMessage);
                successCount++;
            } catch (error) {
                errorCount++;
            }
        }
    });

    logInfo('Broadcast completado:', {
        successCount,
        errorCount,
        totalConnections: activeConnections.size,
        messageType: 'shutdown'
    });

    // Cerrar el servidor
    server.close(() => {
        process.exit(0);
    });
});

module.exports = { app, server };