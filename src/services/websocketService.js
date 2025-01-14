// src/services/websocketService.js

class WebSocketManager {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.connections = new Map();
        this.heartbeatInterval = 45000; // 45 segundos
        this.setupWebSocket();
        
        // Suscribirse a eventos de conversación
        this.setupConversationEvents();
    }

    setupConversationEvents() {
        const conversationService = require('./conversationService');
        
        // Escuchar eventos de actualización de conversaciones
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

        // Log del resultado del broadcast
        console.log('Broadcast completado:', {
            successCount,
            errorCount,
            totalConnections: this.connections.size
        });
    }
}