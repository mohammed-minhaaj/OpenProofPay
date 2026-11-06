import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './GeminiProvider.js';

describe('GeminiProvider Model Fallback & Execution Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default model gemini-3-flash-preview', () => {
    const provider = new GeminiProvider('test-key');
    expect(provider.defaultModel).toBe('gemini-3-flash-preview');
    expect(provider.name).toBe('gemini');
  });

  it('successfully completes with the primary model if available', async () => {
    const provider = new GeminiProvider('test-key', 'gemini-3.5-flash');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ overallScore: 90, status: 'PASSED' }) }]
            }
          }
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await provider.generateCompletion({
      messages: [{ role: 'user', content: 'Evaluate this code' }],
      responseFormat: 'json'
    });

    expect(result.model).toBe('gemini-3.5-flash');
    expect((result.parsedJson as any).overallScore).toBe(90);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]![0]).toContain('gemini-3.5-flash:generateContent');
  });

  it('automatically falls over to next candidate model if primary model returns 404/429/503', async () => {
    // If user configured a deprecated model like gemini-2.5-pro or an exhausted model
    const provider = new GeminiProvider('test-key', 'gemini-2.5-pro');

    const mockFetch = vi.fn()
      // First call with gemini-2.5-pro returns 404
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 404,
            message: 'This model models/gemini-2.5-pro is no longer available to new users.'
          }
        })
      })
      // Second call fails over to gemini-3-flash-preview and succeeds!
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ score: 95, verdict: 'PASS' }) }]
              }
            }
          ],
          usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 80, totalTokenCount: 280 }
        })
      });

    vi.stubGlobal('fetch', mockFetch);

    const result = await provider.generateCompletion({
      messages: [{ role: 'user', content: 'Verify PR' }],
      responseFormat: 'json'
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]![0]).toContain('gemini-2.5-pro:generateContent');
    expect(mockFetch.mock.calls[1]![0]).toContain('gemini-3-flash-preview:generateContent');
    expect(result.model).toBe('gemini-3-flash-preview');
    expect((result.parsedJson as any).score).toBe(95);
  });
});
