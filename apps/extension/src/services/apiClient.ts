import { storageService, StoredUser } from './storageService.js';
import {
  RegisterUserInput,
  LoginUserInput,
  TaskStatus,
  PaymentStatus,
  CreateTaskInput,
  ReviewTaskInput,
  IAcceptanceCriterion
} from '@openproofpay/shared';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5001/api/v1';

export interface ApiErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export class ExtensionApiError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(message: string, code = 'API_ERROR', statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'ExtensionApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface RequestOptions extends RequestInit {
  retryOn401?: boolean;
}

class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: ((token: string | null) => void)[] = [];

  private onTokenRefreshed(token: string | null) {
    this.refreshSubscribers.forEach((callback) => callback(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(callback: (token: string | null) => void) {
    this.refreshSubscribers.push(callback);
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { retryOn401 = true, ...fetchOptions } = options;
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const accessToken = await storageService.getAccessToken();
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers
    });

    // 401 Unauthorized Handling with Token Rotation
    if (response.status === 401 && retryOn401) {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        const refreshToken = await storageService.getRefreshToken();

        if (!refreshToken) {
          this.isRefreshing = false;
          await storageService.clearTokens();
          throw new ExtensionApiError('Session expired. Please log in again.', 'UNAUTHORIZED', 401);
        }

        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });

          const refreshData = await refreshRes.json();
          if (refreshRes.ok && refreshData.data?.tokens) {
            const { accessToken: newAccess, refreshToken: newRefresh } = refreshData.data.tokens;
            await storageService.setTokens(newAccess, newRefresh);
            this.isRefreshing = false;
            this.onTokenRefreshed(newAccess);
            return this.request<T>(endpoint, { ...options, retryOn401: false });
          } else {
            throw new Error('Refresh failed');
          }
        } catch {
          this.isRefreshing = false;
          await storageService.clearTokens();
          this.onTokenRefreshed(null);
          throw new ExtensionApiError('Session expired. Please log in again.', 'UNAUTHORIZED', 401);
        }
      } else {
        // Wait for active refresh to complete
        return new Promise<T>((resolve, reject) => {
          this.addRefreshSubscriber((newToken) => {
            if (newToken) {
              resolve(this.request<T>(endpoint, { ...options, retryOn401: false }));
            } else {
              reject(new ExtensionApiError('Session expired. Please log in again.', 'UNAUTHORIZED', 401));
            }
          });
        });
      }
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const code = data?.error?.code || 'HTTP_ERROR';
      const msg = data?.error?.message || `Request failed with status ${response.status}`;
      throw new ExtensionApiError(msg, code, response.status, data?.error?.details);
    }

    return data;
  }

  // ==========================================================================
  // AUTH DOMAIN
  // ==========================================================================
  async register(input: RegisterUserInput) {
    const res = await this.request<{
      success: true;
      data: {
        user: StoredUser;
        tokens: { accessToken: string; refreshToken: string; expiresIn: number };
      };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input)
    });

    if (res.data?.tokens && res.data?.user) {
      await storageService.setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
      await storageService.setUser(res.data.user);
    }
    return res.data;
  }

  async login(input: LoginUserInput) {
    const res = await this.request<{
      success: true;
      data: {
        user: StoredUser;
        tokens: { accessToken: string; refreshToken: string; expiresIn: number };
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });

    if (res.data?.tokens && res.data?.user) {
      await storageService.setTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
      await storageService.setUser(res.data.user);
    }
    return res.data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      await storageService.clearTokens();
    }
  }

  async getMe() {
    const res = await this.request<{
      success: true;
      data: {
        user: StoredUser;
        capabilities: {
          canCreateMilestones: boolean;
          canSubmitWork: boolean;
          canApprovePayments: boolean;
        };
      };
    }>('/auth/me');

    if (res.data?.user) {
      await storageService.setUser(res.data.user);
    }
    return res.data;
  }

  // ==========================================================================
  // PROJECTS DOMAIN
  // ==========================================================================
  async listProjects() {
    return this.request<{
      success: true;
      data: Array<{
        id: string;
        name: string;
        description?: string;
        status: string;
        totalBudget: number;
        currency: string;
        createdAt: string;
      }>;
    }>('/projects');
  }

  async createProject(input: { name: string; description?: string; githubRepoId?: string; currency?: string; totalBudget?: number }) {
    return this.request<{
      success: true;
      data: { id: string; name: string };
    }>('/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  // ==========================================================================
  // TASKS DOMAIN
  // ==========================================================================
  async listTasks(filters?: { status?: TaskStatus; projectId?: string }) {
    const query = new URLSearchParams();
    if (filters?.status) query.append('status', filters.status);
    if (filters?.projectId) query.append('projectId', filters.projectId);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<{
      success: true;
      data: Array<{
        id: string;
        title: string;
        description: string;
        status: TaskStatus;
        paymentAmount: number;
        currency: string;
        githubIssueNumber?: number;
        githubIssueUrl?: string;
        assignedDeveloperId?: any;
        employerId?: any;
        acceptanceCriteria: IAcceptanceCriterion[];
        latestReview?: any;
        createdAt: string;
      }>;
    }>(`/tasks${qs}`);
  }

  async getTask(taskId: string) {
    return this.request<{
      success: true;
      data: {
        task: any;
        submissions: any[];
        verificationReports: any[];
        testExecutions: any[];
      };
    }>(`/tasks/${taskId}`);
  }

  async createTask(input: CreateTaskInput) {
    return this.request<{
      success: true;
      data: { id: string; title: string; status: TaskStatus };
    }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async startTask(taskId: string) {
    return this.request<{
      success: true;
      data: { id: string; status: TaskStatus };
    }>(`/tasks/${taskId}/start`, {
      method: 'POST'
    });
  }

  async reviewTask(taskId: string, input: ReviewTaskInput) {
    return this.request<{
      success: true;
      data: { id: string; status: TaskStatus; latestReview: any };
    }>(`/tasks/${taskId}/review`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async approveTask(taskId: string, submissionId?: string, idempotencyKey?: string, notes?: string) {
    return this.request<{
      success: true;
      data: { taskId: string; taskStatus: TaskStatus; payment?: { status: PaymentStatus; paypalCaptureId?: string } };
    }>(`/tasks/${taskId}/approve`, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify({ submissionId, notes })
    });
  }

  async requestRevision(taskId: string, submissionId: string, feedback: string) {
    return this.request<{
      success: true;
      data: { taskStatus: TaskStatus };
    }>(`/tasks/${taskId}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ submissionId, feedback })
    });
  }

  // ==========================================================================
  // AI VERIFICATION DOMAIN
  // ==========================================================================
  async triggerVerification(taskId: string, submissionId?: string) {
    return this.request<{
      success: true;
      data: any;
      message: string;
    }>(`/tasks/${taskId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ submissionId })
    });
  }

  async getVerificationReport(taskId: string) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/verification-report`);
  }

  // ==========================================================================
  // SUBMISSIONS DOMAIN
  // ==========================================================================
  async listSubmissions(taskId?: string) {
    const qs = taskId ? `?taskId=${taskId}` : '';
    return this.request<{
      success: true;
      data: Array<{
        id: string;
        taskId: string;
        prNumber: number;
        prUrl: string;
        headSha: string;
        title: string;
        status: string;
        additions: number;
        deletions: number;
        submittedAt: string;
        verificationReport?: any;
        testExecution?: {
          status: 'PASSED' | 'FAILED' | 'COULD_NOT_EXECUTE' | 'NOT_CONFIGURED';
          totalTests: number;
          passedTests: number;
          failedTests: number;
          sanitizedLogs: string;
        };
      }>;
    }>(`/submissions${qs}`);
  }

  async submitPR(taskId: string, input: { prUrl: string; prNumber?: number }) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/submissions`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  // ==========================================================================
  // PAYMENTS DOMAIN
  // ==========================================================================
  async listPayments() {
    return this.request<{
      success: true;
      data: Array<{
        id: string;
        taskId: string;
        amount: number;
        currency: string;
        status: PaymentStatus;
        paypalOrderId?: string;
        paypalCaptureId?: string;
        idempotencyKey: string;
        createdAt: string;
      }>;
    }>('/payments/history');
  }

  async createTaskOrder(taskId: string, intent: 'AUTHORIZE' | 'CAPTURE' = 'AUTHORIZE') {
    return this.request<{
      success: true;
      data: {
        payment: any;
        order: any;
      };
      message: string;
    }>(`/payments/tasks/${taskId}/create-order`, {
      method: 'POST',
      body: JSON.stringify({ intent })
    });
  }

  async authorizeOrder(orderId: string) {
    return this.request<{
      success: true;
      data: any;
      message: string;
    }>(`/payments/orders/${orderId}/authorize`, {
      method: 'POST'
    });
  }

  async releasePayment(taskId: string) {
    return this.request<{
      success: true;
      data: any;
      message: string;
    }>(`/payments/tasks/${taskId}/release`, {
      method: 'POST'
    });
  }

  async getTaskPayment(taskId: string) {
    return this.request<{
      success: true;
      data: any;
    }>(`/payments/tasks/${taskId}`);
  }

  // ==========================================================================
  // OVERVIEW METRICS
  // ==========================================================================
  async getOverviewMetrics() {
    return this.request<{
      success: true;
      data: {
        totalProjects: number;
        activeTasks: number;
        submittedPRs: number;
        verificationsPassed: number;
        pendingApprovals: number;
        completedPayments: number;
        totalPayoutsValue: number;
      };
    }>('/metrics/overview');
  }

  // ==========================================================================
  // ISOLATED TEST RUNNER DOMAIN
  // ==========================================================================
  async triggerTaskTests(taskId: string, submissionId?: string) {
    return this.request<{
      success: true;
      data: any;
      message: string;
    }>(`/tasks/${taskId}/test`, {
      method: 'POST',
      body: JSON.stringify({ submissionId })
    });
  }

  async getTaskTestExecution(taskId: string) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/test-execution`);
  }
}

export const apiClient = new ApiClient();
