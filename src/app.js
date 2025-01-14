const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const routes = require('./routes');
const conversationService = require('./services/conversationService');
const { logInfo, logError } = require('./utils/logger');

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);

// Mantener registro de conexiones WebSocket activas
const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
});

const activeConnections = new Set();

// Función para enviar actualizaciones a todos los clientes conectados
const broadcastConversations = () => {
    const conversationsMap = conversationService.activeConversations;
    console.log('📊 Estado del servicio:', {
        timestamp: new Date().toISOString(),
        mapSize: conversationsMap.size,
        conversationsKeys: Array.from(conversationsMap.keys()),
        wsConnections: activeConnections.size
    });

    const conversations = Array.from(conversationsMap.values())
        .map(conv => {
            console.log(`📱 Conversación encontrada:`, {
                id: conv.whatsappId,
                messages: conv.messages.length,
                lastUpdate: conv.lastUpdateTime
            });
            return {
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
            };
        });

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
                console.error('❌ Error enviando mensaje a cliente:', {
                    error: error.message,
                    stack: error.stack
                });
                errorCount++;
                activeConnections.delete(client);
            }
        }
    });

    console.log('📊 Resultado del broadcast:', {
        totalConversations: conversations.length,
        successfulSends: successCount,
        errorSends: errorCount,
        timestamp: new Date().toISOString()
    });
};

// Configuración de conexiones WebSocket
wss.on('connection', (ws, req) => {
    console.log('🔌 Nueva conexión WebSocket:', {
        ip: req.socket.remoteAddress,
        timestamp: new Date().toISOString()
    });
    
    activeConnections.add(ws);
    
    // Enviar actualización inicial
    broadcastConversations();
    
    // Configurar intervalo de actualización
    const interval = setInterval(broadcastConversations, 5000);
    
    // Manejar mensajes del cliente
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📥 Mensaje recibido del cliente:', {
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
            console.error('❌ Error procesando mensaje del cliente:', {
                error: error.message,
                stack: error.stack
            });
        }
    });
    
    // Manejar errores de WebSocket
    ws.on('error', (error) => {
        console.error('❌ Error en conexión WebSocket:', {
            error: error.message,
            stack: error.stack
        });
        activeConnections.delete(ws);
    });
    
    // Limpiar recursos cuando se cierra la conexión
    ws.on('close', () => {
        console.log('🔌 Cliente WebSocket desconectado');
        activeConnections.delete(ws);
        clearInterval(interval);
    });
});

// Suscribirse a eventos de conversación
conversationService.on('messageReceived', (data) => {
    console.log('📨 Nuevo mensaje recibido:', {
        conversationId: data.conversationId,
        timestamp: new Date().toISOString()
    });
    broadcastConversations();
});

conversationService.on('conversationCreated', (data) => {
    console.log('🆕 Nueva conversación creada:', {
        conversationId: data.whatsappId,
        timestamp: new Date().toISOString()
    });
    broadcastConversations();
});

conversationService.on('conversationClosed', (data) => {
    console.log('🔒 Conversación cerrada:', {
        conversationId: data.whatsappId,
        timestamp: new Date().toISOString()
    });
    broadcastConversations();
});

conversationService.on('error', (error) => {
    console.error('❌ Error en el servicio de conversaciones:', {
        error: error.message,
        stack: error.stack
    });
});

// Middleware para procesar JSON y formularios
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware para CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    next();
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para logging de requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Rutas principales
app.get('/', (req, res) => {
    res.status(200).send('¡Bienvenido a la API de JULI! El servidor está funcionando.');
});

app.get('/monitor', (req, res) => {
    console.log('Sirviendo monitor de conversaciones');
    res.sendFile(path.join(__dirname, 'public', 'conversations.html'));
});

// Nueva ruta de depuración para estado de WebSocket
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

// Health check mejorado
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
    console.error('Error:', err.stack);
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

// Exportar app y server para uso en server.js
module.exports = { app, server };