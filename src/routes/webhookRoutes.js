const express = require('express');
const { processWebhook } = require('../controllers/webhookController');
const router = express.Router();

router.post('/', processWebhook);

module.exports = router;
