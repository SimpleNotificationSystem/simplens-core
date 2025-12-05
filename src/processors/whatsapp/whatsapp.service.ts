/**
 * WhatsApp Service - Mock implementation for testing
 * Logs messages instead of sending to actual WhatsApp API
 */

import type { whatsapp_notification } from '@src/types/types.js';
import { whatsappProcessorLogger as logger } from '@src/workers/utils/logger.js';

/**
 * Result from WhatsApp send operation
 */
export interface WhatsAppResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Mock WhatsApp API delay (simulates network latency)
 */
const MOCK_API_DELAY_MS = 100;

/**
 * Mock success rate (95% success for testing)
 */
const MOCK_SUCCESS_RATE = 0.95;

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
 * Generate mock message ID
 */
const generateMockMessageId = (): string => {
    return `whatsapp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Send a WhatsApp notification (MOCK implementation)
 * 
 * In production, this would integrate with:
 * - WhatsApp Business API
 * - Twilio WhatsApp
 * - MessageBird
 * - etc.
 */
export const sendWhatsApp = async (notification: whatsapp_notification): Promise<WhatsAppResult> => {
    logger.info(`[MOCK] Sending WhatsApp to ${notification.recipient.phone}`);

    // Process message content
    let messageContent = notification.content.message;

    // Replace template variables if defined
    if (notification.variables && Object.keys(notification.variables).length > 0) {
        logger.info('[MOCK] Replacing template variables');
        messageContent = replaceTemplateVariables(messageContent, notification.variables);
    }

    logger.info(`[MOCK] Message: ${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, MOCK_API_DELAY_MS));

    // Simulate success/failure based on mock success rate
    const isSuccess = Math.random() < MOCK_SUCCESS_RATE;

    if (isSuccess) {
        const mockMessageId = generateMockMessageId();
        logger.success(`[MOCK] WhatsApp sent successfully: ${mockMessageId}`);
        
        return {
            success: true,
            messageId: mockMessageId
        };
    } else {
        const mockError = 'Mock delivery failure - simulated for testing';
        logger.error(`[MOCK] WhatsApp delivery failed: ${mockError}`);
        
        return {
            success: false,
            error: mockError
        };
    }
};

/**
 * Initialize WhatsApp service (no-op for mock)
 */
export const initWhatsAppService = (): void => {
    logger.info('[MOCK] WhatsApp service initialized (mock mode)');
};

/**
 * Close WhatsApp service (no-op for mock)
 */
export const closeWhatsAppService = (): void => {
    logger.info('[MOCK] WhatsApp service closed');
};
