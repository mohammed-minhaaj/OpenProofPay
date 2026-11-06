import fs from 'fs';
import path from 'path';
import { DetectedProject, SupportedLanguage } from './interfaces.js';

export class ProjectDetector {
  /**
   * Detect project runtime and test framework from a directory on disk
   */
  static async detectFromDirectory(workspaceDir: string): Promise<DetectedProject> {
    if (!fs.existsSync(workspaceDir)) {
      return this.emptyDetection();
    }

    const files = await this.listAllRelativeFiles(workspaceDir);
    return this.detectFromFiles(files, (filePath: string) => {
      try {
        const full = path.join(workspaceDir, filePath);
        if (fs.existsSync(full)) {
          return fs.readFileSync(full, 'utf-8');
        }
      } catch {
        return null;
      }
      return null;
    });
  }

  /**
   * Detect project runtime and test framework given a list of file paths and an optional file content reader
   */
  static detectFromFiles(
    relativePaths: string[],
    contentReader?: (filePath: string) => string | null
  ): DetectedProject {
    const configFiles: string[] = [];
    const normalized = relativePaths.map((f) => f.replace(/\\/g, '/').replace(/^\/+/, ''));

    // 1. Node.js / TypeScript / React / JS
    const pkgPath = normalized.find((p) => p === 'package.json' || p.endsWith('/package.json'));
    if (pkgPath) {
      configFiles.push(pkgPath);
      let pkgJson: any = null;
      if (contentReader) {
        const raw = contentReader(pkgPath);
        if (raw) {
          try {
            pkgJson = JSON.parse(raw);
          } catch {
            pkgJson = null;
          }
        }
      }

      const hasTs = normalized.some((p) => p.endsWith('.ts') || p.endsWith('.tsx') || p === 'tsconfig.json');
      const language: SupportedLanguage = hasTs ? 'typescript' : 'javascript';

      if (pkgJson) {
        const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
        const scripts = pkgJson.scripts || {};

        if (deps.vitest || (scripts.test && scripts.test.includes('vitest'))) {
          return {
            language,
            framework: 'vitest',
            testCommand: 'npx vitest run',
            runtimeImage: 'node:20-alpine',
            hasTests: true,
            configFilesFound: configFiles
          };
        }

        if (deps.jest || (scripts.test && scripts.test.includes('jest'))) {
          return {
            language,
            framework: 'jest',
            testCommand: 'npx jest --ci --colors=false',
            runtimeImage: 'node:20-alpine',
            hasTests: true,
            configFilesFound: configFiles
          };
        }

        if (scripts.test && !scripts.test.includes('no test specified')) {
          return {
            language,
            framework: 'npm-test',
            testCommand: 'npm test',
            runtimeImage: 'node:20-alpine',
            hasTests: true,
            configFilesFound: configFiles
          };
        }

        // Package.json exists, but default "no test specified" error or empty scripts
        return {
          language,
          framework: 'none',
          testCommand: '',
          runtimeImage: 'node:20-alpine',
          hasTests: false,
          configFilesFound: configFiles
        };
      }

      // If package.json found but couldn't read contents, check presence of vitest or jest configs
      if (normalized.some((p) => p.includes('vitest.config'))) {
        return {
          language,
          framework: 'vitest',
          testCommand: 'npx vitest run',
          runtimeImage: 'node:20-alpine',
          hasTests: true,
          configFilesFound: configFiles
        };
      }
      if (normalized.some((p) => p.includes('jest.config'))) {
        return {
          language,
          framework: 'jest',
          testCommand: 'npx jest --ci',
          runtimeImage: 'node:20-alpine',
          hasTests: true,
          configFilesFound: configFiles
        };
      }

      return {
        language,
        framework: 'npm-test',
        testCommand: 'npm test',
        runtimeImage: 'node:20-alpine',
        hasTests: true,
        configFilesFound: configFiles
      };
    }

    // 2. Python
    const pythonConfigFiles = normalized.filter((p) =>
      p === 'pytest.ini' ||
      p === 'pyproject.toml' ||
      p === 'requirements.txt' ||
      p === 'setup.py' ||
      p === 'Pipfile'
    );

    const hasPyFiles = normalized.some((p) => p.endsWith('.py'));
    const hasTestDir = normalized.some((p) => p.startsWith('tests/') || p.startsWith('test/') || p.includes('/tests/'));

    if (pythonConfigFiles.length > 0 || (hasPyFiles && hasTestDir)) {
      configFiles.push(...pythonConfigFiles);
      return {
        language: 'python',
        framework: 'pytest',
        testCommand: 'pytest -v',
        runtimeImage: 'python:3.11-slim',
        hasTests: true,
        configFilesFound: configFiles
      };
    }

    // 3. Java (Maven / Gradle)
    if (normalized.some((p) => p === 'pom.xml' || p.endsWith('/pom.xml'))) {
      configFiles.push('pom.xml');
      return {
        language: 'java',
        framework: 'junit',
        testCommand: 'mvn test -B',
        runtimeImage: 'maven:3.9-eclipse-temurin-17-alpine',
        hasTests: true,
        configFilesFound: configFiles
      };
    }

    if (normalized.some((p) => p === 'build.gradle' || p === 'build.gradle.kts')) {
      configFiles.push('build.gradle');
      return {
        language: 'java',
        framework: 'junit',
        testCommand: 'gradle test --no-daemon',
        runtimeImage: 'gradle:8.5-jdk17-alpine',
        hasTests: true,
        configFilesFound: configFiles
      };
    }

    // 4. C++ (CMake)
    if (normalized.some((p) => p === 'CMakeLists.txt' || p.endsWith('/CMakeLists.txt'))) {
      configFiles.push('CMakeLists.txt');
      return {
        language: 'cpp',
        framework: 'ctest',
        testCommand: 'cmake -B build && cmake --build build && ctest --test-dir build --output-on-failure',
        runtimeImage: 'gcc:13',
        hasTests: true,
        configFilesFound: configFiles
      };
    }

    return this.emptyDetection();
  }

  private static emptyDetection(): DetectedProject {
    return {
      language: 'unknown',
      framework: 'none',
      testCommand: '',
      runtimeImage: 'none',
      hasTests: false,
      configFilesFound: []
    };
  }

  private static async listAllRelativeFiles(dir: string, base: string = dir): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }
        const full = path.join(dir, entry.name);
        const rel = path.relative(base, full);
        if (entry.isDirectory()) {
          const sub = await this.listAllRelativeFiles(full, base);
          results.push(...sub);
        } else {
          results.push(rel);
        }
      }
    } catch {
      // Ignore read errors
    }
    return results;
  }
}
