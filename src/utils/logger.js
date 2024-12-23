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
  
  module.exports = { logInfo, logError };
  