import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatPayPalAmount,
  generatePayPalRequestId,
  PayPalErrorResponse
} from './interfaces.js';
import { PayPalClient } from './PayPalClient.js';

describe('APIMatic PayPal Contract Validation & Schema Hardening', () => {
  // ==========================================================================
  // 1. ISO-4217 DECIMAL PRECISION (PAYPAL V2 AMOUNT CONTRACT)
  // ==========================================================================
  describe('1. ISO-4217 Decimal Precision & Currency Formatting', () => {
    it('formats standard two-decimal currencies (USD, EUR, GBP) with exactly 2 decimal places', () => {
      const usdResult = formatPayPalAmount(100, 'USD');
      expect(usdResult.currency_code).toBe('USD');
      expect(usdResult.value).toBe('100.00');

      const eurResult = formatPayPalAmount(45.5, 'EUR');
      expect(eurResult.currency_code).toBe('EUR');
      expect(eurResult.value).toBe('45.50');

      const gbpResult = formatPayPalAmount(99.994, 'GBP');
      expect(gbpResult.currency_code).toBe('GBP');
      expect(gbpResult.value).toBe('99.99');
    });

    it('formats zero-decimal currencies (JPY, HUF, TWD, KRW) without decimal fractions', () => {
      const jpyResult = formatPayPalAmount(1500, 'JPY');
      expect(jpyResult.currency_code).toBe('JPY');
      expect(jpyResult.value).toBe('1500');

      const krwResult = formatPayPalAmount(25000.8, 'KRW');
      expect(krwResult.currency_code).toBe('KRW');
      expect(krwResult.value).toBe('25001');
    });

    it('formats three-decimal currencies (KWD, BHD, JOD, OMR) with exactly 3 decimal places', () => {
      const kwdResult = formatPayPalAmount(15.2, 'KWD');
      expect(kwdResult.currency_code).toBe('KWD');
      expect(kwdResult.value).toBe('15.200');
    });
  });

  // ==========================================================================
  // 2. IDEMPOTENCY KEY CONFORMANCE (PAYPAL-REQUEST-ID MAX 36 CHARS)
  // ==========================================================================
  describe('2. PayPal-Request-Id Idempotency Header Schema Conformance', () => {
    it('generates a standard 36-character UUID when no seed is provided', () => {
      const id = generatePayPalRequestId();
      expect(id.length).toBe(36);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('strictly clamps long custom seeds to 36 characters to prevent PayPal 400 schema rejection', () => {
      const longSeed = 'opp-cap-6728eb7a9d3148479e000001-AUTH-1730718587123-EXTENDED';
      expect(longSeed.length).toBeGreaterThan(36);

      const sanitizedId = generatePayPalRequestId(longSeed);
      expect(sanitizedId.length).toBeLessThanOrEqual(36);
    });

    it('preserves clean seeds that are under 36 characters', () => {
      const cleanSeed = 'ord-6728eb7a9d3148479e000001';
      expect(cleanSeed.length).toBeLessThanOrEqual(36);

      const result = generatePayPalRequestId(cleanSeed);
      expect(result).toBe(cleanSeed);
      expect(result.length).toBeLessThanOrEqual(36);
    });
  });

  // ==========================================================================
  // 3. RFC-7807 & PAYPAL V2 ERROR STRUCTURE PARSING
  // ==========================================================================
  describe('3. RFC-7807 & PayPal Error Parsing & Debug ID Logging', () => {
    it('extracts name, message, details issues, and debug_id cleanly', () => {
      const errorPayload: PayPalErrorResponse = {
        name: 'INVALID_REQUEST',
        message: 'Request is not well-formed, syntactically incorrect, or violates schema.',
        debug_id: '902d338cb4402',
        details: [
          {
            field: '/purchase_units/@reference_id==default/amount/value',
            value: '100',
            issue: 'DECIMAL_PRECISION_REQUIRED',
            description: 'Decimal precision required for currency USD.'
          }
        ]
      };

      const formatted = PayPalClient.formatPayPalError(errorPayload, 'Default fallback');
      expect(formatted).toContain('[INVALID_REQUEST]');
      expect(formatted).toContain('DECIMAL_PRECISION_REQUIRED');
      expect(formatted).toContain('Decimal precision required for currency USD');
      expect(formatted).toContain('[debug_id: 902d338cb4402]');
    });

    it('falls back to default message if error response is empty or null', () => {
      const formatted = PayPalClient.formatPayPalError(null, 'Network connection failed');
      expect(formatted).toBe('Network connection failed');
    });
  });

  // ==========================================================================
  // 4. ORDERS V2 & WEBHOOK VERIFICATION CONTRACT VALIDATION
  // ==========================================================================
  describe('4. Mock & Live Client Contract Conformance', () => {
    beforeEach(() => {
      PayPalClient.setMockMode(true);
    });

    afterEach(() => {
      PayPalClient.setMockMode(false);
    });

    it('orders v2 mock contract returns valid status, intent, and approval links', async () => {
      const order = await PayPalClient.createOrder(
        {
          intent: 'AUTHORIZE',
          purchase_units: [
            {
              reference_id: 'task-123',
              amount: { currency_code: 'USD', value: '250.00' }
            }
          ]
        },
        'test-idempotency-key'
      );

      expect(order.id).toBeDefined();
      expect(order.status).toBe('CREATED');
      expect(order.intent).toBe('AUTHORIZE');
      expect(order.purchase_units?.[0]?.amount.value).toBe('250.00');
      expect(order.links?.some((l) => l.rel === 'approve')).toBe(true);
    });

    it('capture authorization returns valid completed capture payload conforming to APIMatic schema', async () => {
      const capture = await PayPalClient.captureAuthorization(
        'AUTH-12345',
        { currency_code: 'USD', value: '250.00' },
        'capture-idemp-1'
      );

      expect(capture.id).toBeDefined();
      expect(capture.status).toBe('COMPLETED');
      expect(capture.amount.value).toBe('250.00');
      expect(capture.final_capture).toBe(true);
    });

    it('payouts contract returns valid batch header conforming to Payouts v1 schema', async () => {
      const payout = await PayPalClient.createPayout(
        {
          sender_batch_header: {
            sender_batch_id: 'batch-test-1',
            email_subject: 'OpenProofPay Payout'
          },
          items: [
            {
              recipient_type: 'EMAIL',
              amount: { value: '250.00', currency: 'USD' },
              receiver: 'developer@example.com',
              sender_item_id: 'task-1'
            }
          ]
        },
        'payout-idemp-1'
      );

      expect(payout.batch_header.payout_batch_id).toBeDefined();
      expect(payout.batch_header.batch_status).toBe('SUCCESS');
      expect(payout.batch_header.sender_batch_header.sender_batch_id).toBe('batch-test-1');
    });

    it('verifies webhook signature payload with snake_case parameters required by PayPal schema', async () => {
      const verified = await PayPalClient.verifyWebhookSignature({
        auth_algo: 'SHA256withRSA',
        cert_url: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
        transmission_id: 'trans-123',
        transmission_sig: 'sig-abc',
        transmission_time: new Date().toISOString(),
        webhook_id: 'WH-123',
        webhook_event: { id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' }
      });

      expect(verified).toBe(true);
    });
  });
});
