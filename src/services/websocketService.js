// src/services/websocketService.js
const WebSocket = require('ws');
const { logInfo, logError } = require('../utils/logger');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.connections = new Map();
    this.heartbeatInterval = 30000; // 30 segundos
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId(req);
      this.connections.set(clientId, {
        ws,
        isAlive: true,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now()
      });

      logInfo('Nueva conexión WebSocket', {
        clientId,
        ip: req.socket.remoteAddress
      });

      // Configurar ping/pong
      ws.on('pong', () => {
        const connection = this.connections.get(clientId);
        if (connection) {
          connection.isAlive = true;
          connection.lastHeartbeat = Date.now();
        }
      });

      // Manejar mensajes del cliente
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'heartbeat') {
            ws.send(JSON.stringify({ type: 'heartbeat-ack' }));
          }
        } catch (error) {
          logError('Error procesando mensaje WebSocket', { error });
        }
      });

      // Manejar desconexión
      ws.on('close', () => {
        this.connections.delete(clientId);
        logInfo('Cliente WebSocket desconectado', { clientId });
      });

      // Iniciar heartbeat para este cliente
      this.startHeartbeat(clientId);
    });

    // Limpieza periódica de conexiones inactivas
    setInterval(() => this.cleanupInactiveConnections(), this.heartbeatInterval);
  }

  startHeartbeat(clientId) {
    const interval = setInterval(() => {
      const connection = this.connections.get(clientId);
      if (!connection) {
        clearInterval(interval);
        return;
      }

      if (!connection.isAlive) {
        this.connections.delete(clientId);
        connection.ws.terminate();
        clearInterval(interval);
        return;
      }

      connection.isAlive = false;
      connection.ws.ping();
    }, this.heartbeatInterval);
  }

  cleanupInactiveConnections() {
    const now = Date.now();
    for (const [clientId, connection] of this.connections.entries()) {
      if (!connection.isAlive || now - connection.lastHeartbeat > this.heartbeatInterval * 2) {
        connection.ws.terminate();
        this.connections.delete(clientId);
        logInfo('Conexión inactiva eliminada', { clientId });
      }
    }
  }

  generateClientId(req) {
    return `${req.socket.remoteAddress}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  broadcast(data) {
    this.connections.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    });
  }

  getStats() {
    return {
      activeConnections: this.connections.size,
      connectionsList: Array.from(this.connections.entries()).map(([clientId, conn]) => ({
        clientId,
        connectedAt: conn.connectedAt,
        lastHeartbeat: conn.lastHeartbeat,
        isAlive: conn.isAlive
      }))
    };
  }
}

module.exports = WebSocketManager;