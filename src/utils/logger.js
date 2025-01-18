// logger.js - Módulo para logs estructurados
const formatDetails = (details) => {
  if (!details) return '';
  try {
    // Solo incluir campos relevantes y compactar el JSON
    const relevantDetails = {};
    Object.entries(details).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        // Si es un timestamp, usar solo la hora
        if (key === 'timestamp' && typeof value === 'string') {
          relevantDetails[key] = value.split('T')[1].split('.')[0];
        } 
        // Para IDs largos, truncar
        else if (key === 'id' && typeof value === 'string' && value.length > 12) {
          relevantDetails[key] = value.substring(0, 8) + '...';
        }
        // Para contadores y estados, mantener tal cual
        else if (['successCount', 'errorCount', 'totalConnections', 'status', 'type'].includes(key)) {
          relevantDetails[key] = value;
        }
        // Para objetos de memoria, convertir a MB y redondear
        else if (key === 'memory' || key.includes('heap')) {
          relevantDetails[key] = Math.round(value / 1024 / 1024) + 'MB';
        }
        // Para mensajes y errores, incluir solo si son cortos
        else if (typeof value === 'string' && value.length < 50) {
          relevantDetails[key] = value;
        }
      }
    });
    
    return Object.keys(relevantDetails).length ? 
      JSON.stringify(relevantDetails, null, 0) : '';
  } catch (err) {
    return '';
  }
};

const logInfo = (message, details) => {
  console.log(`[INFO] ${message}${details ? ' ' + formatDetails(details) : ''}`);
};

const logError = (message, details) => {
  console.error(`[ERROR] ${message}${details ? ' ' + formatDetails(details) : ''}`);
};

const logDebug = (message, details) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEBUG] ${message}${details ? ' ' + formatDetails(details) : ''}`);
  }
};

module.exports = { logInfo, logError, logDebug };