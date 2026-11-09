import {
  RegisterUserInput,
  LoginUserInput,
  CreateProjectInput,
  CreateTaskInput,
  ReviewTaskInput,
  TaskStatus,
  UserRole
} from '@openproofpay/shared';

const resolveDefaultApiUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (envUrl && envUrl.trim() && !envUrl.includes('localhost:5001')) {
    return envUrl.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host.includes('-web.onrender.com')) {
      return `https://${host.replace('-web.onrender.com', '-api.onrender.com')}/api/v1`;
    }
    if (host.endsWith('.onrender.com') && host.includes('web')) {
      return `https://${host.replace('web', 'api')}/api/v1`;
    }
  }
  return (envUrl && envUrl.trim()) || 'http://localhost:5001/api/v1';
};

export const API_BASE_URL = resolveDefaultApiUrl();

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  githubConnected?: boolean;
  githubUsername?: string;
}

class WebApiClient {
  private token: string | null = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? window.localStorage.getItem('openproofpay_token')
    : null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      if (token) {
        window.localStorage.setItem('openproofpay_token', token);
      } else {
        window.localStorage.removeItem('openproofpay_token');
      }
    }
  }

  getToken() {
    return this.token;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const controller = new AbortController();
    const timeoutMs = 30000; // 30-second safe timeout
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || controller.signal
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs / 1000} seconds. Please check your network or try again.`);
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      let msg = data?.error?.message || `Request failed with status ${res.status}`;
      if (data?.error?.details) {
        if (Array.isArray(data.error.details)) {
          const detailStr = data.error.details
            .map((d: any) => (d.message ? `${d.path ? d.path + ': ' : ''}${d.message}` : JSON.stringify(d)))
            .join('; ');
          if (detailStr) msg += `: ${detailStr}`;
        } else if (typeof data.error.details === 'string') {
          msg += `: ${data.error.details}`;
        } else if (typeof data.error.details === 'object') {
          msg += `: ${JSON.stringify(data.error.details)}`;
        }
      }
      throw new Error(msg);
    }

    return data;
  }

  // Auth
  async register(input: RegisterUserInput) {
    const res = await this.request<{
      success: true;
      data: { user: UserSession; tokens: { accessToken: string; refreshToken: string } };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    if (res.data?.tokens?.accessToken) {
      this.setToken(res.data.tokens.accessToken);
    }
    return res.data;
  }

  async login(input: LoginUserInput) {
    const res = await this.request<{
      success: true;
      data: { user: UserSession; tokens: { accessToken: string; refreshToken: string } };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    if (res.data?.tokens?.accessToken) {
      this.setToken(res.data.tokens.accessToken);
    }
    return res.data;
  }

  async getMe() {
    return this.request<{
      success: true;
      data: { user: UserSession; capabilities: any };
    }>('/auth/me');
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async updateProfile(input: { name?: string; githubUsername?: string; paypalReceiverEmail?: string }) {
    return this.request<{
      success: true;
      data: { user: UserSession };
      message: string;
    }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
  }

  async linkGitHub(githubUsername: string) {
    return this.updateProfile({ githubUsername });
  }

  // Projects
  async listProjects() {
    return this.request<{
      success: true;
      data: any[];
    }>('/projects');
  }

  async createProject(input: CreateProjectInput) {
    return this.request<{
      success: true;
      data: any;
    }>('/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async getProject(projectId: string) {
    return this.request<{
      success: true;
      data: { project: any; tasks: any[] };
    }>(`/projects/${projectId}`);
  }

  // Tasks
  async listTasks(filters?: { status?: TaskStatus; projectId?: string }) {
    const query = new URLSearchParams();
    if (filters?.status) query.append('status', filters.status);
    if (filters?.projectId) query.append('projectId', filters.projectId);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<{
      success: true;
      data: any[];
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
      data: any;
    }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async startTask(taskId: string) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/start`, {
      method: 'POST'
    });
  }

  async claimTask(taskId: string) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/claim`, {
      method: 'POST'
    });
  }

  async reviewTask(taskId: string, input: ReviewTaskInput) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/review`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async submitPR(taskId: string, input: { prUrl: string; prNumber?: number; githubUsername?: string }) {
    return this.request<{
      success: true;
      data: any;
    }>(`/tasks/${taskId}/submissions`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

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

  // ==========================================================================
  // PAYPAL PAYMENTS DOMAIN
  // ==========================================================================
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

  async authorizeOrder(orderId: string, options?: { simulate?: boolean }) {
    return this.request<{
      success: true;
      data: any;
      message: string;
    }>(`/payments/orders/${orderId}/authorize`, {
      method: 'POST',
      body: JSON.stringify(options || {})
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

  async retryPayout(taskId: string) {
    return this.request<{
      success: true;
      data: any;
      message: string;
    }>(`/payments/tasks/${taskId}/retry-payout`, {
      method: 'POST'
    });
  }

  async getTaskPayment(taskId: string) {
    return this.request<{
      success: true;
      data: any;
    }>(`/payments/tasks/${taskId}`);
  }

  async getPaymentHistory() {
    return this.request<{
      success: true;
      data: any[];
    }>('/payments/history');
  }

  // ==========================================================================
  // ANALYTICS & GITHUB HELPER METHODS
  // ==========================================================================
  async getAnalyticsOverview() {
    return this.request<{
      success: true;
      data: {
        summary: {
          totalProjects: number;
          totalTasks: number;
          totalBountiesValue: number;
          totalDisbursed: number;
          activeHoldAmount: number;
          overallPassRate: number;
        };
        tasksOverTime: Array<{
          date: string;
          created: number;
          verified: number;
          completed: number;
        }>;
        verificationDistribution: Array<{
          verdict: string;
          count: number;
          percentage: number;
        }>;
        paymentsByProject: Array<{
          project: string;
          disbursed: number;
          authorized: number;
        }>;
        qualityTrends: Array<{
          date: string;
          avgAiScore: number;
          avgDurationSec: number;
          testPassRate: number;
        }>;
      };
    }>('/analytics/overview');
  }

  async listRepositories() {
    return this.request<{
      success: true;
      data: any[];
    }>('/github/repos');
  }

  async listRepoPullRequests(owner: string, repo: string) {
    return this.request<{
      success: true;
      data: any[];
    }>(`/github/repos/${owner}/${repo}/pulls`);
  }

  async listRepoIssues(owner: string, repo: string) {
    return this.request<{
      success: true;
      data: any[];
    }>(`/github/repos/${owner}/${repo}/issues`);
  }

  async getIssue(owner: string, repo: string, issueNumber: number) {
    return this.request<{
      success: true;
      data: any;
    }>(`/github/repos/${owner}/${repo}/issues/${issueNumber}`);
  }

  async listPullRequests(owner: string, repo: string) {
    return this.request<{
      success: true;
      data: Array<{
        number: number;
        title: string;
        state: string;
        htmlUrl: string;
        headSha: string;
        baseBranch: string;
        headBranch: string;
        author: string;
        createdAt: string;
      }>;
    }>(`/github/repos/${owner}/${repo}/pulls`);
  }

  async getPullRequest(owner: string, repo: string, prNumber: number) {
    return this.request<{
      success: true;
      data: any;
    }>(`/github/repos/${owner}/${repo}/pulls/${prNumber}`);
  }

  async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async patch<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined
    });
  }
}

export const webApi = new WebApiClient();
export const api = webApi;