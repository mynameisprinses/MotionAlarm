import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';

import { ApiError, ApiService } from './api-request';

describe('Supabase REST requests', () => {
  const originalUrl = environment.supabaseUrl;
  const originalKey = environment.supabasePublishableKey;
  beforeEach(() => {
    environment.supabaseUrl = 'https://example.supabase.co';
    environment.supabasePublishableKey = 'sb_publishable_test';
  });
  afterEach(() => {
    environment.supabaseUrl = originalUrl;
    environment.supabasePublishableKey = originalKey;
    vi.restoreAllMocks();
  });

  it('sends the publishable key and current account token to Supabase directly', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    await TestBed.inject(ApiService).request('/rest/v1/alerts', 'GET', undefined, 'account-token');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/alerts',
      expect.objectContaining({
        headers: expect.objectContaining({ apikey: 'sb_publishable_test', Authorization: 'Bearer account-token' }),
      }),
    );
  });

  it('accepts empty successful write responses and parses Supabase auth errors', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await TestBed.inject(ApiService).request('/rest/v1/alerts', 'DELETE')).toBeUndefined();
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }), { status: 400 }),
    );
    await expect(
      TestBed.inject(ApiService).request('/auth/v1/token?grant_type=password', 'POST', {}),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    });
  });

  it('distinguishes unavailable networks from invalid server responses', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Network error'));
    await expect(TestBed.inject(ApiService).request('/rest/v1/alerts')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    fetch.mockResolvedValueOnce(new Response('<html>Gateway error</html>', { status: 502 }));
    await expect(TestBed.inject(ApiService).request('/rest/v1/alerts')).rejects.toBeInstanceOf(ApiError);
  });

  it('does not send requests until a project is configured', async () => {
    environment.supabasePublishableKey = '';
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(TestBed.inject(ApiService).request('/rest/v1/alerts')).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
