/**
 * Email Service - Sends emails using Nodemailer with Gmail SMTP
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '@src/config/env.config.js';
import type { email_notification } from '@src/types/types.js';
import { emailProcessorLogger as logger } from '@src/workers/utils/logger.js';

let transporter: Transporter | null = null;

/**
 * Result from email send operation
 */
export interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Regex to detect if content is HTML
 */
const HTML_REGEX = /<\/?[a-z][\s\S]*>/i;

/**
 * Check if content is HTML
 */
const isHtmlContent = (content: string): boolean => {
    return HTML_REGEX.test(content);
};

/**
 * Replace template variables in message
 * Supports {{variable_name}} syntax
 */
const replaceTemplateVariables = (
    message: string,
    variables: Record<string, string>
): string => {
    let result = message;

    for (const [key, value] of Object.entries(variables)) {
        // Replace {{key}} with value
        const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        result = result.replace(pattern, value);
    }

    return result;
};

/**
 * Initialize the email transporter
 */
export const initEmailTransporter = (): void => {
    if (transporter) {
        return;
    }

    if (!env.EMAIL_USER || !env.EMAIL_PASS) {
        logger.warn('Email credentials not configured. Email sending will fail.');
    }

    transporter = nodemailer.createTransport({
        host: env.EMAIL_HOST,
        port: env.EMAIL_PORT,
        secure: env.EMAIL_PORT === 465, // true for 465, false for other ports
        auth: {
            user: env.EMAIL_USER,
            pass: env.EMAIL_PASS,
        },
    });

    logger.success('Email transporter initialized');
};

/**
 * Verify email transporter connection
 */
export const verifyEmailTransporter = async (): Promise<boolean> => {
    if (!transporter) {
        initEmailTransporter();
    }

    try {
        await transporter!.verify();
        logger.success('Email transporter verified');
        return true;
    } catch (err) {
        logger.error('Email transporter verification failed:', err);
        return false;
    }
};

/**
 * Send an email notification
 */
export const sendEmail = async (notification: email_notification): Promise<EmailResult> => {
    if (!transporter) {
        initEmailTransporter();
    }

    try {
        logger.info(`Sending email to ${notification.recipient.email}`);

        // Process message content
        let messageContent = notification.content.message;

        // Replace template variables if defined
        if (notification.variables && Object.keys(notification.variables).length > 0) {
            logger.info('Replacing template variables');
            messageContent = replaceTemplateVariables(messageContent, notification.variables);
        }

        // Determine if content is HTML or plain text
        const isHtml = isHtmlContent(messageContent);

        const mailOptions: nodemailer.SendMailOptions = {
            from: env.EMAIL_FROM || env.EMAIL_USER,
            to: notification.recipient.email,
            subject: notification.content.subject || 'Notification',
        };

        if (isHtml) {
            mailOptions.html = messageContent;
            logger.info('Sending as HTML email');
        } else {
            mailOptions.text = messageContent;
            logger.info('Sending as plain text email');
        }

        const info = await transporter!.sendMail(mailOptions);

        logger.success(`Email sent successfully`);

        return {
            success: true,
            messageId: info.messageId
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`Failed to send email to ${notification.recipient.email}: ${errorMessage}`);

        return {
            success: false,
            error: errorMessage
        };
    }
};

/**
 * Close the email transporter
 */
export const closeEmailTransporter = (): void => {
    if (transporter) {
        transporter.close();
        transporter = null;
        logger.info('Email transporter closed');
    }
};
