/**
 * API Configuration
 * Centralized configuration for API endpoints
 */

const getWebhookHost = (): string => {
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    return window.__RUNTIME_CONFIG__.webhookHost || "localhost";
  }
  return process.env.WEBHOOK_HOST || "localhost";
};

const getWebhookPort = (): string => {
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    return window.__RUNTIME_CONFIG__.webhookPort || "3002";
  }
  return process.env.WEBHOOK_PORT || "3002";
};

export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
export const NS_API_KEY = process.env.NS_API_KEY || "";
export const WEBHOOK_HOST = getWebhookHost();
export const WEBHOOK_PORT = getWebhookPort();