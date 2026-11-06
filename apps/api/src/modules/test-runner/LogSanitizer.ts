export class LogSanitizer {
  private static readonly MAX_LOG_LENGTH = 50000; // 50 KB max log size

  /**
   * Complete log sanitization pipeline: ANSI strip + secret scrub + length truncation
   */
  static sanitize(rawLogs: string): string {
    if (!rawLogs || typeof rawLogs !== 'string') {
      return '';
    }

    // 1. Strip ANSI escape sequences
    let cleaned = this.stripAnsi(rawLogs);

    // 2. Secret Scrubbing
    cleaned = this.scrubSecrets(cleaned);

    // 3. Truncate if exceeding maximum budget
    cleaned = this.truncate(cleaned);

    return cleaned.trim();
  }

  /**
   * Strip ANSI codes
   */
  static stripAnsi(text: string): string {
    return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }

  /**
   * Scrub API secrets, credentials, tokens, and private keys
   */
  static scrubSecrets(text: string): string {
    return text
      // GitHub Tokens
      .replace(/ghp_[a-zA-Z0-9]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/gho_[a-zA-Z0-9]{20,}/g, '[REDACTED_GITHUB_OAUTH_TOKEN]')
      .replace(/github_pat_[a-zA-Z0-9_]{30,}/g, '[REDACTED_GITHUB_PAT]')
      // OpenAI API Keys
      .replace(/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
      // Google / Gemini API Keys
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      // Anthropic API Keys
      .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_ANTHROPIC_KEY]')
      // Generic JWTs (header.payload.signature)
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]')
      // Bearer Authorization headers
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{16,}/gi, 'Bearer [REDACTED_BEARER_TOKEN]')
      // MongoDB / Database URIs with passwords
      .replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED_DB_PASSWORD]$3')
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED_DB_PASSWORD]$3')
      // Private keys
      .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  }

  /**
   * Truncate oversized logs preserving head and tail
   */
  static truncate(text: string, maxLength: number = this.MAX_LOG_LENGTH): string {
    if (text.length <= maxLength) {
      return text;
    }

    const half = Math.floor(maxLength / 2) - 100;
    const head = text.slice(0, half);
    const tail = text.slice(text.length - half);
    const omitted = text.length - (head.length + tail.length);

    return `${head}\n\n[... TRUNCATED: ${omitted} characters omitted for sandbox safety ...]\n\n${tail}`;
  }
}
