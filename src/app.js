const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const routes = require('./routes');
const conversationService = require('./services/conversationService'); // Añadir esta importación

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuración de WebSocket con ruta específica
const wss = new WebSocket.Server({ 
    server,
    path: '/ws' // Especificar la ruta del WebSocket
});

// Manejador de conexiones WebSocket
wss.on('connection', (ws) => {
    console.log('Cliente WebSocket conectado');
    
    // Enviar actualizaciones de conversaciones
    const sendConversationUpdates = async () => {
        try {
            const conversations = Array.from(conversationService.activeConversations.values())
                .map(conv => ({
                    whatsappId: conv.whatsappId,
                    userPhoneNumber: conv.userPhoneNumber,
                    messages: conv.messages,
                    startTime: conv.startTime,
                    lastUpdateTime: conv.lastUpdateTime,
                    status: conv.status
                }));

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                    type: 'conversations', 
                    data: conversations,
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.error('Error al enviar actualización de conversaciones:', error);
        }
    };
    
    // Enviar actualización inicial
    sendConversationUpdates();
    
    // Configurar intervalo de actualización
    const interval = setInterval(sendConversationUpdates, 5000);
    
    // Manejar mensajes del cliente
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Mensaje recibido del cliente:', data);
        } catch (error) {
            console.error('Error al procesar mensaje del cliente:', error);
        }
    });
    
    // Manejar errores de WebSocket
    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
    });
    
    // Limpiar recursos cuando se cierra la conexión
    ws.on('close', () => {
        console.log('Cliente WebSocket desconectado');
        clearInterval(interval);
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

// Servir archivos estáticos desde el directorio public
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para logging de requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Ruta principal
app.get('/', (req, res) => {
    res.status(200).send('¡Bienvenido a la API de JULI! El servidor está funcionando.');
});

// Ruta para el monitor de conversaciones
app.get('/monitor', (req, res) => {
    console.log('Sirviendo monitor de conversaciones');
    res.sendFile(path.join(__dirname, 'public', 'conversations.html'));
});

// Rutas de la API
app.use('/api', routes);

// Endpoint de health-check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        websocketClients: wss.clients.size
    });
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Ha ocurrido un error'
    });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl
    });
});

// Exportar tanto app como server para poder iniciar el servidor HTTP y WebSocket
module.exports = { app, server };