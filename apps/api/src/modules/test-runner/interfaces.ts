export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'cpp' | 'unknown';

export type DetectedTestFramework = 'vitest' | 'jest' | 'npm-test' | 'pytest' | 'junit' | 'ctest' | 'none';

export interface DetectedProject {
  language: SupportedLanguage;
  framework: DetectedTestFramework;
  testCommand: string;
  runtimeImage: string;
  hasTests: boolean;
  configFilesFound: string[];
}

export interface ParsedOutput {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  detectedFramework?: string;
}

export interface TestSandboxOptions {
  workspaceDir: string;
  testCommand: string;
  runtimeImage: string;
  timeoutMs: number;
  cpuLimit?: string;
  memoryLimit?: string;
  pidsLimit?: number;
  readOnlyRoot?: boolean;
  networkMode?: 'none' | 'bridge' | 'host';
  envVars?: Record<string, string>;
}

export interface TestSandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  rawLogs: string;
  executedInContainer: boolean;
  errorMessage?: string;
}

export interface ISandboxRunner {
  readonly runnerType: string;
  isAvailable(): Promise<boolean>;
  runInSandbox(options: TestSandboxOptions): Promise<TestSandboxResult>;
}

export interface RunTestInput {
  submissionId: string;
  taskId?: string;
  actorId?: string;
  actorRole?: string;
  ipAddress?: string;
}
