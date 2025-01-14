// logger.js - Módulo para logs estructurados

const logInfo = (message, details) => {
    if (details) {
      console.log(`[INFO] ${message}`, JSON.stringify(details, null, 2));
    } else {
      console.log(`[INFO] ${message}`);
    }
  };
  
  const logError = (message, details) => {
    if (details) {
      console.error(`[ERROR] ${message}`, JSON.stringify(details, null, 2));
    } else {
      console.error(`[ERROR] ${message}`);
    }
  };
  
  const logDebug = (message, details) => {
    if (process.env.NODE_ENV !== 'production') {
        if (details) {
            console.log(`[DEBUG] ${message}`, JSON.stringify(details, null, 2));
        } else {
            console.log(`[DEBUG] ${message}`);
        }
    }
};

module.exports = { logInfo, logError, logDebug };
  