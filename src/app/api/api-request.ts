import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  async request<T>(path: string, method = 'GET', body?: unknown, token?: string, prefer?: string): Promise<T> {
    if (!environment.supabaseUrl || !environment.supabasePublishableKey)
      throw new ApiError(503, 'NOT_CONFIGURED', 'The account service is not configured. Please contact the app owner.');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: environment.supabasePublishableKey,
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (prefer) headers['Prefer'] = prefer;
    let response: Response;
    try {
      response = await fetch(environment.supabaseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Could not connect to the account service. Check your connection and try again.',
      );
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text && response.ok) return undefined as T;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(
        502,
        'INVALID_RESPONSE',
        'The account service returned an unexpected response. Please try again.',
      );
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        data.code || data.error_code || data.error || 'REQUEST_FAILED',
        data.message || data.msg || data.error_description || 'The request could not be completed.',
      );
    return data as T;
  }
}
