const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
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

// Configuración de rutas
app.use('/api', routes); // Todas las rutas estarán bajo /api

// Endpoint de health-check
app.get('/health', (req, res) => {
    res.status(200).json({ message: 'Server is running' });
});

// Manejo de errores (por si no hay rutas válidas)
app.use((req, res) => {
    res.status(404).send({ error: 'Ruta no encontrada' });
});

module.exports = app;
