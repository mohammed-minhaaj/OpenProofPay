import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  API_BASE_URL: z.string().default('http://localhost:5000'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  EXTENSION_ID: z.string().default('chrome-extension://abcdefghijklmnopqrstuvwxyz123456'),
  MONGODB_URI: z.string().default(process.env.MONGO_URL || 'mongodb://localhost:27017/openproofpay'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').default('development_jwt_access_secret_key_minimum_32_characters_long_for_security'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').default('development_jwt_refresh_secret_key_minimum_32_characters_long_for_security'),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  AI_PROVIDER: z.string().default('gemini'),
  AI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_NAME: z.string().default('gemini-3.5-flash'),
  AI_TEMPERATURE: z.string().transform((val) => parseFloat(val)).default('0.2'),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_ENVIRONMENT: z.string().default('sandbox'),
  PAYPAL_BASE_URL: z.string().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_PAYOUTS_ENABLED: z.string().transform((v) => v === 'true').default('false')
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid Environment Configuration:', parsed.error.format());
  throw new Error('Environment configuration validation failed');
}

export const env = parsed.data;
