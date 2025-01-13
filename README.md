# Estructura del Proyecto JULI

## Directorio Raíz (/src)

El proyecto está organizado en una estructura modular para facilitar el mantenimiento y la escalabilidad.

### 📂 config/
Contiene archivos de configuración del sistema.

- `chatbase.js`: Configuración para la integración con Chatbase
  - Define las credenciales y endpoints para diferentes servicios
  - Maneja la validación de variables de entorno requeridas
  - Proporciona funciones para obtener configuraciones específicas de servicio

- `google.js`: Configuración para servicios de Google Cloud
  - Configuraciones para Speech-to-Text y Text-to-Speech
  - Define parámetros por defecto como codificación y tasas de muestreo
  - Maneja configuraciones de voces y lenguajes

### 📂 controllers/
Controladores que manejan la lógica de negocio para diferentes rutas.

- `chatbaseController.js`: Maneja interacciones con la API de Chatbase
  - Procesamiento de mensajes para diferentes sectores (servicios públicos, telecomunicaciones)
  - Manejo de respuestas y errores

- `webhookController.js`: Gestiona webhooks de WhatsApp
  - Verificación de webhooks
  - Procesamiento de mensajes entrantes
  - Gestión de conversaciones activas
  - Endpoints de analytics

### 📂 integrations/
Módulos de integración con servicios externos.

- `googleSTT.js` y `googleTTS.js`: Integraciones con servicios de voz de Google
  - Conversión de audio a texto y viceversa
  - Manejo de formatos y configuraciones específicas

- `chatbaseClient.js`: Cliente para interactuar con Chatbase
  - Envío y recepción de mensajes
  - Manejo de sesiones y contexto

### 📂 public/
Archivos accesibles públicamente y componentes de frontend.

- `conversations.html`: Dashboard para monitoreo de conversaciones
- `ConversationViewer.jsx`: Componente React para visualización de conversaciones

### 📂 routes/
Definición de rutas de la API.

- `chatbaseRoutes.js`: Rutas para interacciones con Chatbase
- `webhookRoutes.js`: Rutas para webhooks de WhatsApp
- `index.js`: Agregador de rutas

### 📂 services/
Servicios principales de la aplicación.

#### 📂 email/
Servicios relacionados con el envío de correos.

- 📂 templates/
  - `baseEmailTemplate.js`: Plantilla base para todos los correos
  - `serviciosPublicosEmail.js`: Plantilla específica para servicios públicos
  - `telecomunicacionesEmail.js`: Plantilla para telecomunicaciones
  - `transporteAereoEmail.js`: Plantilla para transporte aéreo

- `emailService.js`: Servicio principal de correo
  - Configuración de nodemailer
  - Manejo de plantillas
  - Envío de correos

#### 📂 legalAgents/
Agentes de procesamiento legal.

- 📂 prompts/
  - Contiene prompts específicos para cada tipo de servicio
  - Define la estructura y formato de las respuestas

- `index.js`: Sistema principal de agentes legales
  - Procesamiento de quejas
  - Generación de documentos
  - Análisis de casos

### 📂 templates/
Plantillas para generación de documentos.

- `serviciosPublicos.js`: Plantilla para documentos de servicios públicos
- `telecomunicaciones.js`: Plantilla para documentos de telecomunicaciones
- `transporteAereo.js`: Plantilla para documentos de transporte aéreo

### 📂 tests/
Pruebas automatizadas del sistema.

- 📂 email/: Pruebas de servicios de correo
- 📂 integration/: Pruebas de integración
- 📂 unit/: Pruebas unitarias

### 📂 utils/
Utilidades y helpers.

- `logger.js`: Utilidad de logging estructurado
- `fileUtils.js`: Utilidades para manejo de archivos
- `pdfUtils.js`: Utilidades para manipulación de PDFs

### Archivos Principales

- `app.js`: Configuración principal de Express
  - Middleware
  - Manejo de CORS
  - Configuración de rutas
  - Manejo de errores

- `server.js`: Punto de entrada de la aplicación
  - Creación del servidor HTTP
  - Configuración del puerto
  - Logging de solicitudes

## Convenciones del Proyecto

### Estructura de Módulos
- Cada módulo principal está en su propio directorio
- Los archivos relacionados se agrupan en subdirectorios
- Se mantiene una clara separación de responsabilidades

### Nomenclatura
- Archivos en camelCase
- Componentes React en PascalCase
- Nombres descriptivos que indican la funcionalidad

### Organización de Imports
1. Módulos de Node.js nativos
2. Dependencias externas
3. Importaciones internas del proyecto
4. Tipos y interfaces (si aplica)

### Manejo de Configuración
- Variables de entorno en `.env`
- Configuraciones específicas en `/config`
- Valores por defecto seguros

## Flujo de Desarrollo

1. Las nuevas características se desarrollan en módulos separados
2. Se crean pruebas en el directorio correspondiente
3. Se actualizan las configuraciones necesarias
4. Se documentan los cambios
5. Se integran en la aplicación principal

## Consideraciones de Seguridad

- Los archivos sensibles están excluidos de git
- Las credenciales se manejan a través de variables de entorno
- Los logs están sanitizados
- Se implementa validación de entrada en todas las rutas


import React, { useState, useEffect } from 'react';
import { MessageCircle, Phone, Clock, RefreshCcw, Search, AlertCircle } from 'lucide-react';

const Alert = ({ children }) => (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 flex items-center gap-2">
    <AlertCircle className="h-5 w-5" />
    {children}
  </div>
);

const ConversationMonitor = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/webhook/conversations');
      if (!response.ok) throw new Error('Error al cargar conversaciones');
      const data = await response.json();
      setConversations(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const filteredConversations = conversations.filter(conv =>
    conv.userPhoneNumber.includes(searchTerm) ||
    conv.messages.some(msg => 
      msg.content?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Monitor de Conversaciones JULI</h1>
          <div className="flex items-center justify-between">
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar conversaciones..."
                className="pl-8 pr-4 py-2 w-full rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={fetchConversations}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <RefreshCcw className="h-4 w-4" />
              Actualizar
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert>
            <div>
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
          </Alert>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Conversations List */}
            <div className="md:col-span-1 space-y-4">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-blue-600" />
                  Conversaciones Activas ({filteredConversations.length})
                </h2>
                <div className="space-y-2">
                  {filteredConversations.map((conv) => (
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
                          <Phone className="h-4 w-4 text-gray-600" />
                          <span className="font-medium">{conv.userPhoneNumber}</span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {conv.messages.length} msgs
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(conv.startTime)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Conversation Details */}
            <div className="md:col-span-2">
              <div className="bg-white rounded-lg shadow p-4 h-full">
                {selectedConversation ? (
                  <>
                    <div className="border-b pb-4 mb-4">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Phone className="h-5 w-5 text-blue-600" />
                        {selectedConversation.userPhoneNumber}
                      </h2>
                      <div className="text-sm text-gray-500 mt-1">
                        Inicio: {new Date(selectedConversation.startTime).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
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
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            <div className="text-sm mb-1">
                              {msg.direction === 'inbound' ? 'Usuario' : 'JULI'}
                            </div>
                            <div>{msg.content}</div>
                            <div className="text-xs mt-1 opacity-75">
                              {formatTime(msg.timestamp)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Selecciona una conversación para ver los detalles
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

src/public/ConversationViewer.jsx