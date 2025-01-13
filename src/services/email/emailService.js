// src/services/email/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

class EmailService {
    constructor() {
        // Validar variables de entorno requeridas
        const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        }

        // Configuración del transporter
        const config = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true'
            }
        };

        console.log('Initializing email service with config:', {
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.auth.user
        });

        this.transporter = nodemailer.createTransport(config);
    }

    async validateConfig() {
        try {
            console.log('Verifying email service connection...');
            await this.transporter.verify();
            console.log('Email service connection verified successfully');
            return true;
        } catch (error) {
            console.error('Email service connection failed:', error.message);
            throw error;
        }
    }

    async sendEmail(lead, documentPath, serviceType) {
        try {
            if (!lead?.email) throw new Error('Email del destinatario no proporcionado');
            if (!documentPath) throw new Error('Ruta del documento no proporcionada');
            if (!serviceType) throw new Error('Tipo de servicio no proporcionado');

            const attachments = [];

            // Validar que el documento existe
            try {
                await fs.access(documentPath);
                attachments.push({
                    filename: 'documento.docx',
                    path: documentPath
                });
            } catch (error) {
                throw new Error(`El documento no existe en la ruta: ${documentPath}`);
            }

            const mailOptions = {
                from: {
                    name: 'Jurídica en Línea',
                    address: process.env.SMTP_FROM
                },
                to: lead.email,
                subject: 'Su documento legal - Jurídica en Línea',
                text: `Estimado/a ${lead.name},\n\nAdjunto encontrará su documento legal.\n\nSaludos cordiales,\nEquipo de Jurídica en Línea`,
                attachments
            };

            console.log('Attempting to send email to:', lead.email);
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully:', info.messageId);

            return {
                success: true,
                messageId: info.messageId,
                to: lead.email,
                timestamp: new Date().toISOString(),
                response: info.response
            };

        } catch (error) {
            console.error('Error sending email:', error.message);
            throw error;
        }
    }
}

// Exportar una única instancia del servicio
const emailService = new EmailService();
module.exports = emailService;