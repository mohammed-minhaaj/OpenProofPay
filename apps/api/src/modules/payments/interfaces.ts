import { PaymentStatus } from '@openproofpay/shared';

export interface PayPalOAuthTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce: string;
}

export interface PayPalOrderAmount {
  currency_code: string;
  value: string;
}

export interface PayPalCreateOrderPayload {
  intent: 'AUTHORIZE' | 'CAPTURE';
  purchase_units: Array<{
    reference_id: string;
    description?: string;
    custom_id?: string;
    invoice_id?: string;
    amount: PayPalOrderAmount;
  }>;
  application_context?: {
    brand_name?: string;
    landing_page?: 'LOGIN' | 'BILLING' | 'NO_PREFERENCE';
    user_action?: 'CONTINUE' | 'PAY_NOW';
    return_url?: string;
    cancel_url?: string;
  };
}

export interface PayPalOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  intent: string;
  purchase_units?: Array<{
    reference_id?: string;
    amount: PayPalOrderAmount;
    payments?: {
      authorizations?: Array<{
        id: string;
        status: string;
        amount: PayPalOrderAmount;
        expiration_time?: string;
      }>;
      captures?: Array<{
        id: string;
        status: string;
        amount: PayPalOrderAmount;
      }>;
    };
  }>;
  links?: Array<{ href: string; rel: string; method: string }>;
}

export interface PayPalCaptureResponse {
  id: string;
  status: 'COMPLETED' | 'PENDING' | 'DECLINED' | 'FAILED';
  amount: PayPalOrderAmount;
  final_capture?: boolean;
  create_time?: string;
  update_time?: string;
}

export interface PayPalPayoutItem {
  recipient_type: 'EMAIL';
  amount: { value: string; currency: string };
  receiver: string;
  note?: string;
  sender_item_id: string;
}

export interface PayPalPayoutRequest {
  sender_batch_header: {
    sender_batch_id: string;
    email_subject?: string;
    email_message?: string;
  };
  items: PayPalPayoutItem[];
}

export interface PayPalPayoutResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'DENIED' | 'CANCELED';
    sender_batch_header: {
      sender_batch_id: string;
    };
  };
}

export interface PayPalWebhookVerificationRequest {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
  webhook_id: string;
  webhook_event: Record<string, unknown>;
}

export interface PayPalWebhookVerificationResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}

// ============================================================================
// APIMATIC VALIDATED ERROR STRUCTURES (RFC-7807 & PAYPAL V2 SCHEMA)
// ============================================================================
export interface PayPalErrorDetail {
  field?: string;
  value?: string;
  location?: string;
  issue: string;
  description?: string;
}

export interface PayPalErrorResponse {
  name: string;
  message: string;
  debug_id?: string;
  information_link?: string;
  details?: PayPalErrorDetail[];
  links?: Array<{ href: string; rel: string; method: string }>;
}

/**
 * Format currency amount strictly conforming to ISO-4217 decimal conventions
 * validated by APIMatic PayPal API specifications
 */
export function formatPayPalAmount(amount: number, currency: string = 'USD'): PayPalOrderAmount {
  const zeroDecimalCurrencies = ['JPY', 'HUF', 'TWD', 'KRW'];
  const threeDecimalCurrencies = ['BHD', 'JOD', 'KWD', 'OMR'];

  const upper = (currency || 'USD').toUpperCase();
  let val: string;

  if (zeroDecimalCurrencies.includes(upper)) {
    val = Math.round(amount).toString();
  } else if (threeDecimalCurrencies.includes(upper)) {
    val = amount.toFixed(3);
  } else {
    val = amount.toFixed(2);
  }

  return {
    currency_code: upper,
    value: val
  };
}

/**
 * Generate a strict PayPal-Request-Id header conforming to the 36-character maximum
 * schema requirement validated by APIMatic
 */
export function generatePayPalRequestId(seed?: string): string {
  if (seed) {
    // Generate deterministic 36-char string from seed
    const cleanSeed = seed.replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanSeed.length <= 36) {
      return cleanSeed;
    }
    // Truncate cleanly to 36 chars
    return cleanSeed.slice(0, 36);
  }
  // Standard UUID v4 is exactly 36 chars
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CreateOrderInput {
  taskId: string;
  intent?: 'AUTHORIZE' | 'CAPTURE';
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentDetailsDTO {
  id: string;
  taskId: string;
  projectId: string;
  employerId: string;
  developerId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paypalOrderId?: string;
  paypalAuthorizationId?: string;
  paypalCaptureId?: string;
  paypalPayoutBatchId?: string;
  idempotencyKey: string;
  approvedAt?: string;
  createdAt: string;
  events?: any[];
}
