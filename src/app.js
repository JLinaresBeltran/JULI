const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const routes = require('./routes'); // Importar las rutas

dotenv.config();

const app = express();

// Middleware para procesar JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware para registrar solicitudes
app.use((req, res, next) => {
    console.log(`Solicitud recibida: ${req.method} ${req.url}`);
    next();
});

// Servir archivos estáticos (por ejemplo, favicon.ico)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para la raíz
app.get('/', (req, res) => {
    res.status(200).send('¡Bienvenido a la API de WhatsApp! El servidor está funcionando.');
});

// Endpoint de health-check
app.get('/health', (req, res) => {
    res.status(200).json({ message: 'Server is running' });
});

// Manejo de la solicitud para favicon.ico
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Configuración de rutas
app.use('/api', routes); // Todas las rutas estarán bajo /api

// Manejo de errores (por si no hay rutas válidas)
app.use((req, res) => {
    res.status(404).send({ error: 'Ruta no encontrada' });
});

module.exports = app;
