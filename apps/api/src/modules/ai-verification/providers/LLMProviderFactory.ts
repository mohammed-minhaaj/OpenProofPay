import { ILLMProvider } from '../interfaces.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { MockLLMProvider } from './MockLLMProvider.js';
import { env } from '../../../config/env.js';

export class LLMProviderFactory {
  private static overrideProvider?: ILLMProvider;

  /**
   * Set an explicit provider instance (useful for unit/integration testing)
   */
  static setProvider(provider?: ILLMProvider) {
    this.overrideProvider = provider;
  }

  /**
   * Get the active configured LLM provider
   */
  static getProvider(): ILLMProvider {
    if (this.overrideProvider) {
      return this.overrideProvider;
    }

    const providerType = (env.AI_PROVIDER || 'gemini').toLowerCase();
    const model = env.AI_MODEL_NAME;

    if (env.NODE_ENV === 'test' && (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.startsWith('AQ.') || providerType === 'mock')) {
      return new MockLLMProvider();
    }

    if (providerType === 'mock') {
      return new MockLLMProvider();
    }

    if (providerType === 'openai') {
      const apiKey = env.OPENAI_API_KEY || env.AI_API_KEY;
      if (!apiKey) return new MockLLMProvider();
      return new OpenAIProvider(apiKey, model || 'gpt-4o');
    }

    if (providerType === 'anthropic') {
      const apiKey = env.ANTHROPIC_API_KEY || env.AI_API_KEY;
      if (!apiKey) return new MockLLMProvider();
      return new AnthropicProvider(apiKey, model || 'claude-3-5-sonnet-20241022');
    }

    // Default to Gemini
    const geminiKey = env.GEMINI_API_KEY || env.AI_API_KEY;
    if (!geminiKey) return new MockLLMProvider();
    return new GeminiProvider(geminiKey, model || 'gemini-3.5-flash');
  }
}