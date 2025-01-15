// src/controllers/webhookController.js
class WebhookController {
    constructor() {
        this.wsManager = WebSocketManager.getInstance();
        this.messageProcessor = new MessageProcessor(
            conversationService,
            whatsappService,
            this.wsManager
        );
        this.webhookProcessor = new WebhookProcessor(
            this.messageProcessor,
            this.wsManager
        );
    }

    async verifyWebhook(req, res) {
        const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
        const verifyToken = process.env.VERIFY_TOKEN;

        const validChallenge = WebhookValidator.validateVerification(mode, token, challenge, verifyToken);

        if (validChallenge) {
            logInfo('Webhook verified successfully');
            res.status(200).send(validChallenge);
        } else {
            logError('Webhook verification failed');
            res.status(403).send('Forbidden');
        }
    }

    async receiveMessage(req, res) {
        try {
            const results = await this.webhookProcessor.processWebhook(req.body);
            res.status(200).send('EVENT_RECEIVED');
        } catch (error) {
            logError('Webhook processing error', { error });
            res.status(200).send('EVENT_RECEIVED');
        }
    }

    async getConversations(req, res) {
        try {
            const conversations = conversationService.getAllConversations();
            res.status(200).json(conversations);
        } catch (error) {
            logError('Error retrieving conversations', { error });
            res.status(500).json({ error: error.message });
        }
    }

    async getConversationAnalytics(req, res) {
        try {
            const analytics = await conversationService.getConversationAnalytics();
            res.status(200).json(analytics);
        } catch (error) {
            logError('Error generating analytics', { error });
            res.status(500).json({ error: error.message });
        }
    }

    async handleHeartbeat(req, res) {
        try {
            const { conversationId } = req.body;
            if (!conversationId) throw new Error('ConversationId is required');
            
            conversationService.updateConversationHeartbeat(conversationId);
            res.status(200).json({ status: 'success', timestamp: new Date() });
        } catch (error) {
            logError('Heartbeat error', { error });
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new WebhookController();