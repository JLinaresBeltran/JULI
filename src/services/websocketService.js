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
            logInfo('Nueva conexión WebSocket establecida', { id });

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    logInfo('Mensaje WebSocket recibido:', { id, type: data.type });
                    await this.handleClientMessage(id, data);
                } catch (error) {
                    logError('Error procesando mensaje WebSocket:', {
                        id,
                        error: error.message,
                        message: message.toString()
                    });
                }
            });

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
                    this.handleConnectionError(id, heartbeat, error);
                }
            }, this.heartbeatInterval);

            ws.on('pong', () => {
                this.updateConnectionHeartbeat(id);
            });

            ws.on('close', () => {
                this.handleConnectionClose(id, heartbeat);
            });

            ws.on('error', (error) => {
                this.handleConnectionError(id, heartbeat, error);
            });

            this.sendInitialState(id);
        });
    }

    async handleClientMessage(id, data) {
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
    }

    sendInitialState(id) {
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

        this.broadcastConversations();
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
                return true;
            }
            return false;
        } catch (error) {
            logError('Error enviando mensaje al cliente:', {
                id,
                error: error.message,
                data
            });
            return false;
        }
    }

    handleConnectionClose(id, heartbeat) {
        clearInterval(heartbeat);
        this.connections.delete(id);
        logInfo('Conexión WebSocket cerrada', { id });
    }

    handleConnectionError(id, heartbeat, error) {
        logError('Error en conexión WebSocket:', {
            id,
            error: error.message,
            stack: error.stack
        });
        clearInterval(heartbeat);
        this.connections.delete(id);
    }

    updateConnectionHeartbeat(id) {
        const connection = this.connections.get(id);
        if (connection) {
            connection.lastHeartbeat = Date.now();
            logInfo('Heartbeat actualizado', { id });
        }
    }

    setupConversationEvents() {
        if (this.conversationService) {
            this.conversationService.on('conversationUpdated', (conversation) => {
                this.broadcastConversationUpdate(conversation);
            });

            this.conversationService.on('conversationClosed', (data) => {
                this.broadcastConversations();
            });

            this.conversationService.on('newMessage', (conversationId) => {
                this.broadcastConversations();
            });
        }
    }

    broadcastConversationUpdate(conversation) {
        try {
            if (!conversation || !conversation.whatsappId) {
                logInfo('Conversación no válida para actualizar', { 
                    hasConversation: !!conversation,
                    hasId: conversation?.whatsappId 
                });
                return;
            }

            const formattedConversation = this.formatConversation(conversation);
            if (!formattedConversation) {
                logError('Error formateando conversación para broadcast', {
                    whatsappId: conversation.whatsappId
                });
                return;
            }

            const message = {
                type: 'conversationUpdate',
                data: formattedConversation,
                timestamp: Date.now()
            };

            const result = this.broadcast(message);
            logInfo('Actualización de conversación transmitida', {
                whatsappId: conversation.whatsappId,
                messageCount: conversation.messages?.length || 0,
                success: result.successCount,
                errors: result.errorCount
            });

        } catch (error) {
            logError('Error en broadcastConversationUpdate:', {
                error: error.message,
                conversationId: conversation?.whatsappId,
                stack: error.stack
            });
        }
    }

    async broadcastConversations() {
        try {
            const conversations = this.conversationService.getAllConversations()
                .map(conv => this.formatConversation(conv))
                .filter(conv => conv !== null);

            const message = {
                type: 'conversations',
                data: conversations,
                timestamp: Date.now()
            };

            const result = this.broadcast(message);
            
            logInfo('Conversaciones transmitidas', { 
                count: conversations.length,
                success: result.successCount,
                errors: result.errorCount
            });
        } catch (error) {
            logError('Error en broadcastConversations:', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    broadcast(message) {
        let successCount = 0;
        let errorCount = 0;
        const totalConnections = this.connections.size;

        this.connections.forEach((connection, id) => {
            try {
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.send(JSON.stringify(message));
                    successCount++;
                }
            } catch (error) {
                errorCount++;
                logError('Error en broadcast para conexión:', {
                    connectionId: id,
                    error: error.message
                });
            }
        });

        logInfo('Broadcast completado:', {
            successCount,
            errorCount,
            totalConnections,
            messageType: message.type
        });

        return { successCount, errorCount, totalConnections };
    }

    formatConversation(conversation) {
        try {
            if (!conversation) return null;

            const formatted = {
                whatsappId: conversation.whatsappId,
                userPhoneNumber: conversation.userPhoneNumber,
                messages: (conversation.messages || []).map(msg => ({
                    id: msg.id,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    direction: msg.direction,
                    content: this._formatMessageContent(msg),
                    status: msg.status
                })),
                metadata: conversation.metadata || {},
                category: conversation.category || 'unknown',
                createdAt: conversation.createdAt || new Date(),
                lastUpdateTime: conversation.lastUpdateTime || Date.now(),
                status: conversation.status || 'active',
                awaitingClassification: conversation.awaitingClassification || false,
                messageCount: conversation.messageCount || 0
            };

            return formatted;
        } catch (error) {
            logError('Error formateando conversación:', {
                error: error.message,
                conversationId: conversation?.whatsappId
            });
            return null;
        }
    }

    _formatMessageContent(message) {
        try {
            if (!message) return '';
            
            if (typeof message.content === 'object') {
                return message.content.body || JSON.stringify(message.content);
            }

            if (message.text && message.text.body) {
                return message.text.body;
            }

            return message.content || '';
        } catch (error) {
            logError('Error formateando contenido del mensaje:', {
                error: error.message,
                messageId: message?.id
            });
            return '';
        }
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
                data: { 
                    message: 'Server shutting down...',
                    timestamp: Date.now()
                }
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