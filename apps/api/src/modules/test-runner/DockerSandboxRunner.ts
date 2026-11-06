import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { ISandboxRunner, TestSandboxOptions, TestSandboxResult } from './interfaces.js';

const execFileAsync = promisify(execFile);

export class DockerSandboxRunner implements ISandboxRunner {
  readonly runnerType = 'docker';

  /**
   * Check if Docker CLI and daemon are responding
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('docker', ['info'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run untrusted test suite in ephemeral, locked-down Docker container
   */
  async runInSandbox(options: TestSandboxOptions): Promise<TestSandboxResult> {
    const isDockerUp = await this.isAvailable();
    if (!isDockerUp) {
      return {
        exitCode: 127,
        stdout: '',
        stderr: 'Docker daemon is not available or connection to /var/run/docker.sock failed.',
        durationMs: 0,
        timedOut: false,
        oomKilled: false,
        rawLogs: 'Docker daemon is not available on host. Cannot execute tests in isolated sandbox container.',
        executedInContainer: false,
        errorMessage: 'Docker daemon unavailable'
      };
    }

    const containerName = `opp-test-${crypto.randomBytes(6).toString('hex')}`;
    const startTime = Date.now();
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let timedOut = false;
    let oomKilled = false;

    const timeoutMs = options.timeoutMs || 120000; // Default 120s
    const cpuLimit = options.cpuLimit || '1.0';
    const memoryLimit = options.memoryLimit || '512m';
    const pidsLimit = options.pidsLimit || 64;
    const networkMode = options.networkMode || 'none';

    // Strict Docker security arguments
    const dockerArgs = [
      'run',
      '--name', containerName,
      '--rm',
      '--network', networkMode,
      '--user', '10001:10001',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      `--cpus=${cpuLimit}`,
      `--memory=${memoryLimit}`,
      `--pids-limit=${pidsLimit}`,
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '-v', `${options.workspaceDir}:/workspace:rw`,
      '-w', '/workspace',
      options.runtimeImage,
      'sh', '-c', options.testCommand
    ];

    return new Promise<TestSandboxResult>((resolve) => {
      let childProcess: any = null;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = async () => {
        if (timer) clearTimeout(timer);
        try {
          await execFileAsync('docker', ['rm', '-f', containerName], { timeout: 5000 });
        } catch {
          // Ignore container cleanup error if already removed
        }
      };

      try {
        childProcess = spawn('docker', dockerArgs);

        timer = setTimeout(async () => {
          timedOut = true;
          if (childProcess) {
            childProcess.kill('SIGKILL');
          }
          await cleanup();
        }, timeoutMs);

        childProcess.stdout?.on('data', (data: Buffer) => {
          stdoutBuffer += data.toString();
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
          stderrBuffer += data.toString();
        });

        childProcess.on('error', async (err: Error) => {
          await cleanup();
          const durationMs = Date.now() - startTime;
          resolve({
            exitCode: 1,
            stdout: stdoutBuffer,
            stderr: `${stderrBuffer}\nDocker process error: ${err.message}`,
            durationMs,
            timedOut: false,
            oomKilled: false,
            rawLogs: `${stdoutBuffer}\n${stderrBuffer}\n${err.message}`,
            executedInContainer: false,
            errorMessage: err.message
          });
        });

        childProcess.on('close', async (code: number | null) => {
          await cleanup();
          const durationMs = Date.now() - startTime;
          const exitCode = timedOut ? 124 : (code ?? 1);

          // Exit code 137 typically indicates OOM killed or SIGKILL
          if (exitCode === 137 && !timedOut) {
            oomKilled = true;
          }

          resolve({
            exitCode,
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
            durationMs,
            timedOut,
            oomKilled,
            rawLogs: `${stdoutBuffer}\n${stderrBuffer}`,
            executedInContainer: true
          });
        });
      } catch (err: any) {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          exitCode: 1,
          stdout: stdoutBuffer,
          stderr: err.message,
          durationMs,
          timedOut: false,
          oomKilled: false,
          rawLogs: err.message,
          executedInContainer: false,
          errorMessage: err.message
        });
      }
    });
  }
}
