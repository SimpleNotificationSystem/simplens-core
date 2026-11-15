/**
 * API Configuration
 * Centralized configuration for backend API base URL resolution
 */

const rawBaseUrl = (process.env.API_BASE_URL || 'http://localhost:3000').split('#')[0].trim().replace(/\/+$/, '');
const rawBasePath = (process.env.BASE_PATH || '').split('#')[0].trim().replace(/\/+$/, '');
const normalizedBasePath = rawBasePath.startsWith('/') ? rawBasePath : rawBasePath ? `/${rawBasePath}` : '';

export const API_BASE_URL = normalizedBasePath && !rawBaseUrl.endsWith(normalizedBasePath)
  ? `${rawBaseUrl}${normalizedBasePath}`
  : rawBaseUrl;
