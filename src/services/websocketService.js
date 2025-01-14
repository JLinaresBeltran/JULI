// src/services/websocketService.js
const WebSocket = require('ws');
const EventEmitter = require('events');
const { logInfo, logError } = require('../utils/logger');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.connections = new Map();
        this.heartbeatInterval = 45000; // 45 segundos
    }

    initialize(server) {
        if (this.wss) {
            return; // Ya inicializado
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
            const connection = {
                ws,
                lastHeartbeat: Date.now()
            };

            this.connections.set(id, connection);

            // Configurar heartbeat
            const heartbeat = setInterval(() => {
                try {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.ping();
                    }
                } catch (error) {
                    clearInterval(heartbeat);
                    this.connections.delete(id);
                    logError('Error en heartbeat:', error);
                }
            }, this.heartbeatInterval);

            ws.on('pong', () => {
                if (this.connections.has(id)) {
                    this.connections.get(id).lastHeartbeat = Date.now();
                }
            });

            ws.on('close', () => {
                clearInterval(heartbeat);
                this.connections.delete(id);
                logInfo('WebSocket connection closed', { id });
            });

            ws.on('error', (error) => {
                logError('WebSocket connection error:', {
                    id,
                    error: error.message,
                    stack: error.stack
                });
                clearInterval(heartbeat);
                this.connections.delete(id);
            });

            // Enviar conversaciones actuales al nuevo cliente
            this.broadcastConversations();
        });
    }

    setupConversationEvents() {
        const conversationService = require('./conversationService');
        
        conversationService.on('conversationUpdated', (conversation) => {
            this.broadcastConversationUpdate(conversation);
        });

        conversationService.on('newMessage', (conversationId) => {
            this.broadcastConversations();
        });
    }

    broadcastConversationUpdate(conversation) {
        const message = {
            type: 'conversationUpdate',
            data: this.formatConversation(conversation)
        };

        this.broadcast(message);
    }

    broadcastConversations() {
        const conversationService = require('./conversationService');
        const conversations = Array.from(conversationService.activeConversations.values())
            .map(this.formatConversation);

        const message = {
            type: 'conversations',
            data: conversations,
            timestamp: new Date().toISOString()
        };

        this.broadcast(message);
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

    getStats() {
        return {
            activeConnections: this.connections.size,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            status: this.wss ? 'running' : 'initializing',
            heartbeatInterval: this.heartbeatInterval,
            connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
                id,
                lastHeartbeat: conn.lastHeartbeat,
                readyState: conn.ws.readyState
            }))
        };
    }

    async close() {
        if (this.wss) {
            // Notificar a los clientes
            this.broadcast({
                type: 'shutdown',
                data: { message: 'Server shutting down...' }
            });

            // Cerrar todas las conexiones activas
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

            // Limpiar el mapa de conexiones
            this.connections.clear();

            // Cerrar el servidor WebSocket
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
            totalConnections: this.connections.size
        });
    }
}

// Exportar una instancia única
let instance = null;

module.exports = {
    getInstance: () => {
        if (!instance) {
            instance = new WebSocketManager();
        }
        return instance;
    }
};