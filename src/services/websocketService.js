// src/services/websocketService.js
const WebSocket = require('ws');
const EventEmitter = require('events');
const { logInfo, logError } = require('../utils/logger');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.connections = new Map();
        this.heartbeatInterval = 45000; // 45 segundos
        this.conversationService = require('./conversationService');
    }

    initialize(server) {
        if (this.wss) {
            return;
        }
        
        if (!server) {
            throw new Error('Se requiere una instancia del servidor HTTP para inicializar WebSocket');
        }

        try {
            this.wss = new WebSocket.Server({ server });
            this.setupWebSocket();
            this.setupConversationEvents();
            logInfo('WebSocket Server inicializado correctamente');
        } catch (error) {
            logError('Error inicializando WebSocket Server:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const id = req.headers['sec-websocket-key'];
            logInfo('Nueva conexión WebSocket establecida', { id });

            const connection = {
                ws,
                lastHeartbeat: Date.now(),
                info: {
                    id,
                    ip: req.socket.remoteAddress,
                    userAgent: req.headers['user-agent']
                }
            };

            this.connections.set(id, connection);

            // Manejar mensajes entrantes
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    logInfo('Mensaje WebSocket recibido:', { id, type: data.type });
                    
                    switch (data.type) {
                        case 'getConversations':
                            await this.broadcastConversations();
                            break;
                        case 'heartbeat':
                            this.updateConnectionHeartbeat(id);
                            break;
                        default:
                            logInfo('Tipo de mensaje no manejado:', { type: data.type });
                    }
                } catch (error) {
                    logError('Error procesando mensaje WebSocket:', {
                        id,
                        error: error.message,
                        message: message.toString()
                    });
                }
            });

            // Configurar heartbeat
            const heartbeat = setInterval(() => {
                try {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.ping();
                        this.sendToClient(id, {
                            type: 'heartbeat',
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    clearInterval(heartbeat);
                    this.connections.delete(id);
                    logError('Error en heartbeat:', {
                        id,
                        error: error.message
                    });
                }
            }, this.heartbeatInterval);

            ws.on('pong', () => {
                this.updateConnectionHeartbeat(id);
            });

            ws.on('close', () => {
                clearInterval(heartbeat);
                this.connections.delete(id);
                logInfo('Conexión WebSocket cerrada', { id });
            });

            ws.on('error', (error) => {
                logError('Error en conexión WebSocket:', {
                    id,
                    error: error.message,
                    stack: error.stack
                });
                clearInterval(heartbeat);
                this.connections.delete(id);
            });

            // Enviar estado inicial
            this.sendToClient(id, {
                type: 'connected',
                data: {
                    id,
                    timestamp: Date.now(),
                    serverInfo: {
                        uptime: process.uptime(),
                        connections: this.connections.size
                    }
                }
            });

            // Enviar conversaciones actuales al nuevo cliente
            this.broadcastConversations();
        });
    }

    sendToClient(id, data) {
        try {
            const connection = this.connections.get(id);
            if (connection && connection.ws.readyState === WebSocket.OPEN) {
                connection.ws.send(JSON.stringify(data));
                logInfo('Mensaje enviado al cliente', { 
                    id, 
                    type: data.type 
                });
            }
        } catch (error) {
            logError('Error enviando mensaje al cliente:', {
                id,
                error: error.message,
                data
            });
        }
    }

    updateConnectionHeartbeat(id) {
        const connection = this.connections.get(id);
        if (connection) {
            connection.lastHeartbeat = Date.now();
            logInfo('Heartbeat actualizado', { id, timestamp: connection.lastHeartbeat });
        }
    }

    setupConversationEvents() {
        this.conversationService.on('conversationUpdated', (conversation) => {
            logInfo('Evento conversationUpdated recibido');
            this.broadcastConversationUpdate(conversation);
        });

        this.conversationService.on('newMessage', (conversationId) => {
            logInfo('Evento newMessage recibido', { conversationId });
            this.broadcastConversations();
        });
    }

    broadcastConversationUpdate(conversation) {
        try {
            const message = {
                type: 'conversationUpdate',
                data: this.formatConversation(conversation),
                timestamp: Date.now()
            };

            this.broadcast(message);
        } catch (error) {
            logError('Error en broadcastConversationUpdate:', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    broadcastConversations() {
        try {
            const conversations = this.conversationService.getAllConversations()
                .map(this.formatConversation);

            const message = {
                type: 'conversations',
                data: conversations,
                timestamp: Date.now()
            };

            this.broadcast(message);
            logInfo('Conversaciones transmitidas', { 
                count: conversations.length 
            });
        } catch (error) {
            logError('Error en broadcastConversations:', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    formatConversation(conversation) {
        return {
            whatsappId: conversation.whatsappId,
            userPhoneNumber: conversation.userPhoneNumber,
            messages: conversation.messages.map(msg => ({
                id: msg.id,
                timestamp: msg.timestamp,
                type: msg.type,
                direction: msg.direction,
                content: msg.content,
                status: msg.status
            })),
            startTime: conversation.startTime,
            lastUpdateTime: conversation.lastUpdateTime,
            status: conversation.status,
            metadata: conversation.metadata
        };
    }

    broadcast(data) {
        let successCount = 0;
        let errorCount = 0;

        this.connections.forEach((connection, id) => {
            try {
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.send(JSON.stringify(data));
                    successCount++;
                }
            } catch (error) {
                errorCount++;
                logError('Error en broadcast:', {
                    connectionId: id,
                    error: error.message
                });
            }
        });

        logInfo('Broadcast completado:', {
            successCount,
            errorCount,
            totalConnections: this.connections.size,
            messageType: data.type
        });
    }

    getStats() {
        return {
            activeConnections: this.connections.size,
            uptime: process.uptime(),
            timestamp: Date.now(),
            memory: process.memoryUsage(),
            status: this.wss ? 'running' : 'initializing',
            connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
                id,
                lastHeartbeat: conn.lastHeartbeat,
                readyState: conn.ws.readyState,
                info: conn.info
            }))
        };
    }

    async close() {
        if (this.wss) {
            this.broadcast({
                type: 'shutdown',
                data: { message: 'Server shutting down...', timestamp: Date.now() }
            });

            for (const [id, connection] of this.connections) {
                try {
                    connection.ws.close();
                } catch (err) {
                    logError('Error cerrando conexión WebSocket:', {
                        id,
                        error: err.message
                    });
                }
            }

            this.connections.clear();

            return new Promise((resolve, reject) => {
                this.wss.close((err) => {
                    if (err) {
                        logError('Error cerrando servidor WebSocket:', err);
                        reject(err);
                    } else {
                        this.wss = null;
                        resolve();
                    }
                });
            });
        }
        return Promise.resolve();
    }
}

let instance = null;

module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new WebSocketManager();
        }
        return instance;
    }
};