import { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '../interfaces.js';
import { AppError } from '../../../errors/AppError.js';

export class AnthropicProvider implements ILLMProvider {
  readonly name = 'anthropic';
  readonly defaultModel: string;
  private apiKey: string;

  constructor(apiKey?: string, model = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || '';
    this.defaultModel = model;
  }

  async generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (!this.apiKey) {
      throw AppError.internal('Anthropic API key is not configured in backend environment variables');
    }

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userAndAssistantMessages = request.messages.filter((m) => m.role !== 'system');

    const messages = userAndAssistantMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.2
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `Anthropic request failed with status ${response.status}`;
      throw AppError.internal(`AI Provider Error (Anthropic): ${errorMsg}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    let parsedJson: unknown;
    if (request.responseFormat === 'json') {
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        const cleaned = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        parsedJson = JSON.parse(cleaned);
      }
    }

    return {
      rawText,
      parsedJson,
      model: this.defaultModel,
      provider: this.name,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens || 0,
            completionTokens: data.usage.output_tokens || 0,
            totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
          }
        : undefined
    };
  }
}