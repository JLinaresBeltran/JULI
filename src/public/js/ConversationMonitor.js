import React, { useState, useEffect } from 'react';

// WebSocket Mejorado
class EnhancedWebSocket {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            heartbeatInterval: 30000,
            reconnectDelay: 5000,
            maxReconnectAttempts: 5,
            ...options
        };
        
        this.ws = null;
        this.heartbeatTimer = null;
        this.reconnectAttempts = 0;
        this.lastHeartbeat = null;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        
        this.connect();
    }

    connect() {
        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
            this.setupHeartbeat();
        } catch (error) {
            console.error('Error conectando WebSocket:', error);
            this.handleReconnection();
        }
    }

    setupEventHandlers() {
        this.ws.onopen = () => {
            console.log('WebSocket conectado');
            this.reconnectAttempts = 0;
            this.lastHeartbeat = Date.now();
            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback(true);
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'heartbeat-ack') {
                    this.lastHeartbeat = Date.now();
                } else if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
            } catch (error) {
                console.error('Error procesando mensaje:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket desconectado');
            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback(false);
            }
            this.handleReconnection();
        };

        this.ws.onerror = (error) => {
            console.error('Error de WebSocket:', error);
        };
    }

    setupHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, this.options.heartbeatInterval);
    }

    handleReconnection() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), this.options.reconnectDelay);
        }
    }

    setOnMessage(callback) {
        this.onMessageCallback = callback;
    }

    setOnStatusChange(callback) {
        this.onStatusChangeCallback = callback;
    }

    close() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        if (this.ws) {
            this.ws.close();
        }
    }

    getConnectionStatus() {
        return this.ws ? this.ws.readyState : WebSocket.CLOSED;
    }
}

// Componentes de Iconos
const Icon = ({ children, className = "h-5 w-5" }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={className}
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
    >
        {children}
    </svg>
);

const MessageCircleIcon = (props) => (
    <Icon {...props}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Icon>
);

const PhoneIcon = (props) => (
    <Icon {...props}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </Icon>
);

const ClockIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </Icon>
);

const SearchIcon = (props) => (
    <Icon {...props}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Icon>
);

const AlertIcon = (props) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </Icon>
);

const Alert = ({ children, type = 'error' }) => {
    const styles = {
        error: 'bg-red-100 border-red-400 text-red-700',
        warning: 'bg-yellow-100 border-yellow-400 text-yellow-700',
        info: 'bg-blue-100 border-blue-400 text-blue-700'
    };

    return (
        <div className={`${styles[type]} px-4 py-3 rounded relative mb-4 flex items-center gap-2 border`}>
            <AlertIcon className="h-5 w-5" />
            {children}
        </div>
    );
};

const ConnectionStatus = ({ isConnected, reconnecting }) => {
    if (reconnecting) {
        return (
            <span className="text-sm text-yellow-500 flex items-center gap-1">
                🟡 Reconectando...
            </span>
        );
    }
    return (
        <span className="text-sm flex items-center gap-1">
            {isConnected ? (
                <span className="text-green-500">🟢 Conectado</span>
            ) : (
                <span className="text-red-500">🔴 Desconectado</span>
            )}
        </span>
    );
};

const ConversationMonitor = () => {
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [wsClient, setWsClient] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState({
        isConnected: false,
        reconnecting: false
    });

    useEffect(() => {
        let client;

        const initializeWebSocket = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            client = new EnhancedWebSocket(wsUrl, {
                heartbeatInterval: 30000,
                reconnectDelay: 5000,
                maxReconnectAttempts: 5
            });

            client.setOnMessage((data) => {
                if (data.type === 'conversations') {
                    setConversations(data.data);
                    setLoading(false);
                }
            });

            client.setOnStatusChange((isConnected) => {
                setConnectionStatus(prev => ({
                    isConnected,
                    reconnecting: !isConnected && prev.isConnected
                }));

                if (!isConnected) {
                    setError('Conexión perdida - Intentando reconectar...');
                } else {
                    setError(null);
                }
            });

            setWsClient(client);
        };

        initializeWebSocket();

        return () => {
            if (client) {
                client.close();
            }
        };
    }, []);

    const fetchConversations = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/webhook/conversations');
            if (!response.ok) throw new Error('Error al cargar conversaciones');
            const data = await response.json();
            setConversations(data);
            setError(null);
        } catch (err) {
            console.error('Error cargando conversaciones:', err);
            setError('Error al cargar las conversaciones. Intentando reconectar...');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const filteredConversations = conversations.filter(conv => {
        if (!searchTerm) return true;
        
        return conv.userPhoneNumber.includes(searchTerm) ||
            conv.messages.some(msg => 
                msg.content?.toLowerCase().includes(searchTerm.toLowerCase())
            );
    });

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Monitor de Conversaciones JULI</h1>
                    <div className="flex items-center justify-between">
                        <div className="relative w-64">
                            <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Buscar conversaciones..."
                                className="pl-8 pr-4 py-2 w-full rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <ConnectionStatus 
                            isConnected={connectionStatus.isConnected}
                            reconnecting={connectionStatus.reconnecting}
                        />
                    </div>
                </div>

                {error && (
                    <Alert type={connectionStatus.reconnecting ? 'warning' : 'error'}>
                        <div>
                            <p className="font-bold">
                                {connectionStatus.reconnecting ? 'Reconectando' : 'Error'}
                            </p>
                            <p>{error}</p>
                        </div>
                    </Alert>
                )}

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            <div className="bg-white rounded-lg shadow p-4">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <MessageCircleIcon className="h-5 w-5 text-blue-600" />
                                    Conversaciones Activas ({filteredConversations.length})
                                </h2>
                                <div className="space-y-2">
                                    {filteredConversations.map(conv => (
                                        <div
                                            key={conv.whatsappId}
                                            onClick={() => setSelectedConversation(conv)}
                                            className={`p-4 rounded-lg cursor-pointer transition-colors ${
                                                selectedConversation?.whatsappId === conv.whatsappId
                                                    ? 'bg-blue-50 border-blue-200 border'
                                                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <PhoneIcon className="h-4 w-4 text-gray-600" />
                                                    <span className="font-medium">{conv.userPhoneNumber}</span>
                                                </div>
                                                <span className="text-sm text-gray-500">
                                                    {conv.messages.length} msgs
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                                <ClockIcon className="h-3 w-3" />
                                                {formatTime(conv.lastUpdateTime || conv.startTime)}
                                                {conv.metadata?.hasUnreadMessages && (
                                                    <span className="ml-2 bg-blue-500 rounded-full w-2 h-2"></span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                        <div className="bg-white rounded-lg shadow p-4 min-h-[500px]">
                                {selectedConversation ? (
                                    <>
                                        <div className="border-b pb-4 mb-4">
                                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                                <PhoneIcon className="h-5 w-5 text-blue-600" />
                                                {selectedConversation.userPhoneNumber}
                                            </h2>
                                            <div className="text-sm text-gray-500 mt-1">
                                                Inicio: {new Date(selectedConversation.startTime).toLocaleString()}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                Estado: {selectedConversation.status || 'Activo'}
                                            </div>
                                        </div>
                                        <div className="space-y-4 max-h-[600px] overflow-y-auto" id="chat-messages">
                                            {selectedConversation.messages.map((msg, idx) => (
                                                <div
                                                    key={msg.id || idx}
                                                    className={`flex ${
                                                        msg.direction === 'inbound' ? 'justify-end' : 'justify-start'
                                                    }`}
                                                >
                                                    <div
                                                        className={`max-w-[80%] rounded-lg p-3 ${
                                                            msg.direction === 'inbound'
                                                                ? 'bg-blue-500 text-white'
                                                                : 'bg-gray-100'
                                                        }`}
                                                    >
                                                        <div className="text-sm mb-1">
                                                            {msg.direction === 'inbound' ? 'Usuario' : 'JULI'}
                                                        </div>
                                                        <div className="break-words">
                                                            {msg.type === 'audio' ? (
                                                                <div className="flex items-center gap-2">
                                                                    <span>🎤 Mensaje de voz</span>
                                                                </div>
                                                            ) : (
                                                                msg.content
                                                            )}
                                                        </div>
                                                        <div className="text-xs mt-1 opacity-75 flex items-center gap-2">
                                                            {formatTime(msg.timestamp)}
                                                            {msg.status && (
                                                                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                                                                    msg.status === 'sent' ? 'bg-green-200 text-green-800' :
                                                                    msg.status === 'delivered' ? 'bg-blue-200 text-blue-800' :
                                                                    'bg-gray-200 text-gray-800'
                                                                }`}>
                                                                    {msg.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <MessageCircleIcon className="h-12 w-12 mb-4 text-gray-400" />
                                        <p>Selecciona una conversación para ver los detalles</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConversationMonitor;