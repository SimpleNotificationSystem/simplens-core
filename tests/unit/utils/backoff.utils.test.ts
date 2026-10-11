import { describe, it, expect } from 'vitest';
import { calculateExponentialBackoff } from '../../../src/utils/backoff.utils.js';

describe('calculateExponentialBackoff', () => {
    it('should calculate exponential backoff with default base and max delays', () => {
        expect(calculateExponentialBackoff(0)).toBe(1000);  // 1000 * 2^0
        expect(calculateExponentialBackoff(1)).toBe(2000);  // 1000 * 2^1
        expect(calculateExponentialBackoff(2)).toBe(4000);  // 1000 * 2^2
        expect(calculateExponentialBackoff(3)).toBe(8000);  // 1000 * 2^3
        expect(calculateExponentialBackoff(4)).toBe(16000); // 1000 * 2^4
        expect(calculateExponentialBackoff(5)).toBe(32000); // 1000 * 2^5
    });

    it('should handle custom baseDelay and maxDelay', () => {
        expect(calculateExponentialBackoff(0, 5000, 60000)).toBe(5000);
        expect(calculateExponentialBackoff(1, 5000, 60000)).toBe(10000);
        expect(calculateExponentialBackoff(2, 5000, 60000)).toBe(20000);
        expect(calculateExponentialBackoff(3, 5000, 60000)).toBe(40000);
        expect(calculateExponentialBackoff(4, 5000, 60000)).toBe(60000); // capped at 60s
    });

    it('should cap at maxDelayMs for high retry counts', () => {
        expect(calculateExponentialBackoff(20, 1000, 300000)).toBe(300000);
    });

    it('should handle negative retry counts gracefully', () => {
        expect(calculateExponentialBackoff(-1)).toBe(1000);
    });
});
