export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface LLMCompletionResponse {
  rawText: string;
  parsedJson?: unknown;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ILLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}