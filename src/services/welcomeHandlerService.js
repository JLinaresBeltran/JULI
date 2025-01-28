const whatsappService = require('./whatsappService');
const { logInfo, logError } = require('../utils/logger');

class WelcomeHandlerService {
    async handleInitialInteraction(userId, userName, context = {}) {
        try {
            logInfo('Starting initial interaction', {
                userId,
                userName,
                context: {
                    type: context?.conversation?.origin?.type,
                    id: context?.conversation?.id,
                    hasMessages: !!context?.messages,
                    isSubscription: this.isSubscriptionMessage(context)
                }
            });

            // Obtener solo el texto del mensaje
            const messageText = this.getWelcomeMessage(userName);

            // Enviar solo el texto al servicio de WhatsApp
            const response = await whatsappService.sendMessage(userId, messageText);
            
            if (!response?.messages?.[0]?.id) {
                throw new Error('No message ID received from WhatsApp');
            }

            logInfo('Welcome message sent successfully', {
                userId,
                userName,
                messageId: response?.messages?.[0]?.id,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                message: {
                    type: 'text',
                    text: { body: messageText }
                },
                messageId: response.messages[0].id,
                metadata: {
                    userId,
                    userName,
                    type: 'welcome',
                    context: {
                        conversationId: context?.conversation?.id,
                        initiationType: context?.conversation?.origin?.type || 'unknown'
                    }
                }
            };
        } catch (error) {
            logError('Welcome message failed', {
                error: error.message,
                userId,
                userName,
                context: {
                    type: context?.conversation?.origin?.type,
                    id: context?.conversation?.id
                },
                stack: error.stack
            });
            throw error;
        }
    }

    isSubscriptionMessage(context) {
        return !!(
            context?.statuses?.[0]?.status === "subscribed" ||
            context?.contacts?.[0]?.wa_id && 
            !context?.messages &&
            context?.conversation?.origin?.type === "user_initiated"
        );
    }

    isWelcomeMessageRequired(context) {
        // No enviar mensaje de bienvenida si ya existe una conversación activa
        if (context?.conversation?.exists) {
            return false;
        }

        // Es un nuevo usuario o una suscripción
        return this.isSubscriptionMessage(context) || 
               (context?.contacts?.[0]?.wa_id && !context?.conversation?.id);
    }

    getWelcomeMessage(userName) {
        // Extraer solo el primer nombre
        const firstName = userName.split(' ')[0];
        return `¡Hola ${firstName}! 👋\n\nSoy JULI, tu asistente legal virtual personalizada ✨\n\nMe especializo en brindarte orientación sobre:\n🏠 Servicios públicos\n📱 Telecomunicaciones\n✈️ Transporte aéreo\n\nCuéntame con detalle tu situación para poder ayudarte de la mejor manera posible. 💪`;
    }

    async handleConversationStart(userId, context) {
        try {
            logInfo('New conversation starting', {
                userId,
                hasProfile: !!context?.contacts?.[0]?.profile,
                isSubscription: this.isSubscriptionMessage(context)
            });

            const userName = context?.contacts?.[0]?.profile?.name || 'Usuario';

            // Solo enviamos mensaje si es requerido
            if (this.isWelcomeMessageRequired(context)) {
                logInfo('Sending welcome message for new conversation', {
                    userId,
                    userName,
                    context: {
                        type: context?.conversation?.origin?.type,
                        isSubscription: this.isSubscriptionMessage(context)
                    }
                });

                return await this.handleInitialInteraction(userId, userName, {
                    ...context,
                    isNewConversation: true
                });
            }

            return {
                success: true,
                message: null,
                metadata: {
                    userId,
                    userName,
                    type: 'existing_conversation'
                }
            };

        } catch (error) {
            logError('Failed to handle conversation start', {
                error: error.message,
                userId,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = new WelcomeHandlerService();