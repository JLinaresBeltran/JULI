// Estructura inicial del proyecto con Express y configuraciones básicas

const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const morgan = require('morgan');
const routes = require('./routes');
const http = require('http');

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Configuración de rutas
app.use('/', routes);

// Endpoint para health-check
app.get('/health', (req, res) => {
    res.status(200).json({ message: 'Server is running' });
});

// Manejo de errores
defaultErrorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'An error occurred!' });
};

app.use(defaultErrorHandler);

// Crear servidor y escuchar conexiones
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
