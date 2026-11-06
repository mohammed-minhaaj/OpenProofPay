import { GitHubContext } from './storageService.js';

export function parseGitHubUrl(urlStr: string, title?: string): GitHubContext | null {
  try {
    const url = new URL(urlStr);
    if (!url.hostname.includes('github.com')) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const owner = segments[0]!;
    const repo = segments[1]!;

    if (segments.length >= 4) {
      const typeStr = segments[2];
      const numberStr = segments[3];
      const num = parseInt(numberStr || '', 10);

      if (typeStr === 'issues' && !isNaN(num)) {
        return {
          owner,
          repo,
          type: 'issue',
          number: num,
          url: urlStr,
          title
        };
      } else if (typeStr === 'pull' && !isNaN(num)) {
        return {
          owner,
          repo,
          type: 'pull',
          number: num,
          url: urlStr,
          title
        };
      }
    }

    return {
      owner,
      repo,
      type: 'repo',
      url: urlStr,
      title
    };
  } catch {
    return null;
  }
}
