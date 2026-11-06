import { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '../interfaces.js';
import { AppError } from '../../../errors/AppError.js';

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'openai';
  readonly defaultModel: string;
  private apiKey: string;

  constructor(apiKey?: string, model = 'gpt-4o') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
    this.defaultModel = model;
  }

  async generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (!this.apiKey) {
      throw AppError.internal('OpenAI API key is not configured in backend environment variables');
    }

    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content
    }));

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages,
      temperature: request.temperature ?? 0.2
    };

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens;
    }

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `OpenAI request failed with status ${response.status}`;
      throw AppError.internal(`AI Provider Error (OpenAI): ${errorMsg}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';

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
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0
          }
        : undefined
    };
  }
}