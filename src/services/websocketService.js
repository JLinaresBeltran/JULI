// src/services/websocketService.js
const WebSocket = require('ws');
const EventEmitter = require('events');

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
        
        this.wss = new WebSocket.Server({ server });
        this.setupWebSocket();
        this.setupConversationEvents();
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
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
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
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
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

    broadcast(data) {
        let successCount = 0;
        let errorCount = 0;

        this.connections.forEach((connection) => {
            try {
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.send(JSON.stringify(data));
                    successCount++;
                }
            } catch (error) {
                errorCount++;
                console.error('Error en broadcast:', error);
            }
        });

        console.log('Broadcast completado:', {
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