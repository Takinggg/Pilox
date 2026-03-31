import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const TOKEN_FILE = '/etc/hive/hive.env';

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

interface ApiError {
  message: string;
  code?: string;
  status: number;
}

export class HiveApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tokenLoaded = false;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.HIVE_API_URL ?? DEFAULT_BASE_URL;
  }

  private async loadToken(): Promise<string | null> {
    if (this.tokenLoaded) return this.token;
    this.tokenLoaded = true;

    // Check environment variable first
    if (process.env.HIVE_API_TOKEN) {
      this.token = process.env.HIVE_API_TOKEN;
      return this.token;
    }

    // Read from env file
    if (!existsSync(TOKEN_FILE)) return null;

    try {
      const content = await readFile(TOKEN_FILE, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key.trim() === 'HIVE_API_TOKEN') {
          this.token = rest.join('=').trim().replace(/^["']|["']$/g, '');
          break;
        }
      }
    } catch {
      // Token file unreadable — continue without auth
    }

    return this.token;
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const token = await this.loadToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options?: { timeout?: number; stream?: boolean }
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers = await this.buildHeaders();
    const timeout = options?.timeout ?? 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorData: ApiError;
        try {
          errorData = await response.json() as ApiError;
        } catch {
          errorData = {
            message: response.statusText || `HTTP ${response.status}`,
            status: response.status,
          };
        }
        throw new HiveApiError(
          errorData.message || `Request failed with status ${response.status}`,
          response.status,
          errorData.code
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      let data: T;

      if (contentType.includes('application/json')) {
        data = await response.json() as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      return { ok: true, status: response.status, data };
    } catch (err) {
      if (err instanceof HiveApiError) throw err;

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new HiveApiError('Request timed out', 408, 'TIMEOUT');
      }

      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
        throw new HiveApiError(
          'Cannot connect to Hive API. Is the hive-app service running?',
          0,
          'CONNECTION_REFUSED'
        );
      }

      throw new HiveApiError(message, 0, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  async get<T = unknown>(path: string, options?: { timeout?: number }): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = unknown>(path: string, body?: unknown, options?: { timeout?: number }): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: { timeout?: number }): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T = unknown>(path: string, options?: { timeout?: number }): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async stream(path: string, onData: (line: string) => void): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const headers = await this.buildHeaders();
    headers['Accept'] = 'text/event-stream';

    const controller = new AbortController();

    const handleSignal = () => controller.abort();
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });

      if (!response.ok) {
        throw new HiveApiError(
          `Stream request failed: ${response.statusText}`,
          response.status
        );
      }

      if (!response.body) {
        throw new HiveApiError('No response body for stream', 0, 'NO_BODY');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            onData(line.slice(6));
          } else if (line.trim()) {
            onData(line);
          }
        }
      }

      if (buffer.trim()) {
        onData(buffer);
      }
    } finally {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
    }
  }
}

export class HiveApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'HiveApiError';
    this.status = status;
    this.code = code;
  }
}

export const apiClient = new HiveApiClient();
