import { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '../interfaces.js';
import { AppError } from '../../../errors/AppError.js';

export class GeminiProvider implements ILLMProvider {
  readonly name = 'gemini';
  readonly defaultModel: string;
  private apiKey: string;

  constructor(apiKey?: string, model = 'gemini-3-flash-preview') {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    this.defaultModel = model;
  }

  async generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (!this.apiKey) {
      throw AppError.internal('Gemini API key is not configured in backend environment variables');
    }

    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userAndAssistantMessages = request.messages.filter((m) => m.role !== 'system');

    const contents = userAndAssistantMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 8192,
        responseMimeType: request.responseFormat === 'json' ? 'application/json' : 'text/plain'
      }
    };

    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    // Candidate models to try in order of preference with automatic failover
    const candidateModels = Array.from(
      new Set([
        this.defaultModel,
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.1-pro-preview',
        'gemini-flash-lite-latest'
      ])
    );

    let lastError = '';
    let lastStatus = 500;

    for (const modelToTry of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${this.apiKey}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData?.error?.message || `Gemini API request failed with status ${response.status}`;
          lastError = errorMsg;
          lastStatus = response.status;

          console.warn(`[GeminiProvider] Model '${modelToTry}' returned ${response.status} (${errorMsg}). Failing over to next model candidate...`);
          continue;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text || '';

        let parsedJson: unknown;
        if (request.responseFormat === 'json') {
          try {
            parsedJson = JSON.parse(rawText);
          } catch {
            // Robust extraction: locate the outermost JSON object or array
            const jsonMatch = rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (jsonMatch) {
              try {
                parsedJson = JSON.parse(jsonMatch[0]);
              } catch {
                const cleaned = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
                parsedJson = JSON.parse(cleaned);
              }
            } else {
              const cleaned = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
              parsedJson = JSON.parse(cleaned);
            }
          }
        }

        return {
          rawText,
          parsedJson,
          model: modelToTry,
          provider: this.name,
          usage: data.usageMetadata
            ? {
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0
              }
            : undefined
        };
      } catch (err: any) {
        lastError = err?.message || 'Network error connecting to Gemini API';
        console.warn(`[GeminiProvider] Network/fetch error for '${modelToTry}': ${lastError}. Trying next candidate...`);
      }
    }

    console.error(`[GeminiProvider] All candidate models failed. Last error: ${lastError}`);
    throw AppError.internal(`AI_VERIFICATION_FAILED: All Gemini models failed. Last error (${lastStatus}): ${lastError}`);
  }
}