const http = require('http');
const app = require('./app'); // Importar la configuración de app.js

const PORT = process.env.PORT || 3000;


app.use((req, res, next) => {
    console.log(`Solicitud recibida: ${req.method} ${req.url}`);
    next();
});


// Crear servidor y escuchar conexiones
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => { // Escuchar en todas las interfaces
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
