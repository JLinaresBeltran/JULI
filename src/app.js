const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const routes = require('./routes');
const conversationService = require('./services/conversationService');
const WebSocketManager = require('./services/websocketService');
const webhookController = require('./controllers/webhookController');
const { logInfo, logError } = require('./utils/logger');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
const activeConnections = new Set();

const broadcastConversations = () => {
    if (activeConnections.size === 0) return;

    const conversations = Array.from(conversationService.activeConversations.values())
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

    activeConnections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                logError('Error WebSocket broadcast', { error: error.message });
                activeConnections.delete(client);
            }
        }
    });
};

wss.on('connection', (ws, req) => {
    activeConnections.add(ws);
    
    ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString()
    }));
    
    broadcastConversations();
    
    const handleConversationUpdate = () => broadcastConversations();
    
    conversationService.on('messageReceived', handleConversationUpdate);
    conversationService.on('conversationCreated', handleConversationUpdate);
    conversationService.on('conversationClosed', handleConversationUpdate);
    conversationService.on('conversationUpdated', handleConversationUpdate);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ 
                    type: 'pong',
                    timestamp: new Date().toISOString(),
                    activeConversations: conversationService.activeConversations.size
                }));
            }
        } catch (error) {
            logError('Error procesando mensaje WS', { error: error.message });
        }
    });
    
    const cleanup = () => {
        ['messageReceived', 'conversationCreated', 'conversationClosed', 'conversationUpdated']
            .forEach(event => conversationService.removeListener(event, handleConversationUpdate));
    };
    
    ws.on('error', (error) => {
        logError('Error WS', { error: error.message });
        activeConnections.delete(ws);
        cleanup();
    });
    
    ws.on('close', () => {
        activeConnections.delete(ws);
        cleanup();
    });
});

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS configuration
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.status(200).send('¡Bienvenido a la API de JULI! El servidor está funcionando.');
});

app.get('/monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'conversations.html'));
});

// Webhook integration
app.post('/webhook', webhookController.receiveMessage.bind(webhookController));

app.get('/api/debug/ws-status', (req, res) => {
    res.json({
        activeConnections: activeConnections.size,
        activeConversations: conversationService.activeConversations.size,
        wsServerStatus: wss.readyState,
        connections: Array.from(activeConnections).map(client => ({
            readyState: client.readyState,
            protocol: client.protocol
        })),
        conversationsDetail: Array.from(conversationService.activeConversations.entries())
            .map(([id, conv]) => ({
                id,
                messageCount: conv.messages.length,
                lastUpdate: conv.lastUpdateTime,
                status: conv.status
            })),
        serverInfo: {
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
});

// API routes
app.use('/api', routes);

// Health check endpoint
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

// Error handling middleware
app.use((err, req, res, next) => {
    logError('Error interno', {
        error: err.message,
        path: req.path,
        method: req.method
    });
    
    res.status(500).json({
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Ha ocurrido un error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logInfo('Iniciando apagado graceful');
    
    const shutdownMessage = JSON.stringify({
        type: 'shutdown',
        timestamp: new Date().toISOString()
    });

    activeConnections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(shutdownMessage);
            } catch (error) {
                logError('Error en shutdown', { error: error.message });
            }
        }
    });

    server.close(() => process.exit(0));
});

module.exports = { app, server };