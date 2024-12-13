const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const morgan = require('morgan');
const routes = require('./routes');

// Cargar variables de entorno
dotenv.config();

console.log('Variables cargadas desde .env:', process.env);

const app = express();

// Log de variables para validar carga
console.log('CHATBASE_API_KEY:', process.env.CHATBASE_API_KEY);
console.log('CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID:', process.env.CHATBASE_SERVICIOS_PUBLICOS_CHATBOT_ID);
console.log('CHATBASE_TELECOMUNICACIONES_CHATBOT_ID:', process.env.CHATBASE_TELECOMUNICACIONES_CHATBOT_ID);
console.log('CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID:', process.env.CHATBASE_TRANSPORTE_AEREO_CHATBOT_ID);
console.log('CHATBASE_API_URL:', process.env.CHATBASE_API_URL);

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
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'An error occurred!' });
});

module.exports = app;
