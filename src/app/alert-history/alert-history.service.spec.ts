import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';

import { mockAuth } from '../../testing/firebase-mocks';
import { ApiError, ApiService } from '../api/api-request';
import { AuthService } from '../auth/auth.service';
import { NATIVE_ALARM } from '../home/native-alarm';

import { AlertHistoryService } from './alert-history.service';

const apiRequest = vi.fn();
const movement = {
  id: 'movement',
  source: 'Movement' as const,
  status: 'New' as const,
  createdAt: '2026-11-04T00:00:00.000Z',
  strength: 2.5,
};

describe('REST alert history', () => {
  let history: AlertHistoryService;
  let auth: ReturnType<typeof mockAuth>;
  const native = {
    setHistoryOwner: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn(),
    deleteAlert: vi.fn().mockResolvedValue({ alerts: [] }),
  };
  async function initialize(android = false) {
    apiRequest.mockReset();
    localStorage.clear();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(android);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(android ? 'android' : 'web');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.mocked(apiRequest).mockResolvedValue({ alerts: [] });
    auth = mockAuth();
    native.getState.mockResolvedValue({ alerts: [], historyOwner: 'user-a' });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ApiService, useValue: { request: apiRequest } },
        { provide: NATIVE_ALARM, useValue: native },
      ],
    });
    history = TestBed.inject(AlertHistoryService);
    TestBed.tick();
    await history.refresh();
    vi.mocked(apiRequest).mockClear();
  }
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('ignores test alarms and sends movement through REST with the account token', async () => {
    await initialize();
    history.createAlert('Test', null);
    expect(apiRequest).not.toHaveBeenCalled();
    history.createAlert('Movement', 2.5);
    await history.refresh();
    expect(apiRequest).toHaveBeenCalledWith(
      '/alerts',
      'POST',
      expect.objectContaining({ source: 'Movement' }),
      'test-token',
    );
    expect(history.hasPendingWrites).toBe(false);
  });

  it('keeps offline changes in the account cache and retries them in order', async () => {
    await initialize();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    history.createAlert('Movement', 2.5);
    await history.refresh();
    const alert = history.alerts[0];
    await history.toggleStatus(alert);
    expect(history.alerts[0].status).toBe('Reviewed');
    expect(history.hasPendingWrites).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('motion-alarm-history-user-a')!).changes).toHaveLength(2);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await history.refresh();
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/alerts',
      'POST',
      expect.objectContaining({ id: alert.id }),
      'test-token',
    );
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/alerts/' + alert.id, 'PATCH', { status: 'Reviewed' }, 'test-token');
    expect(history.hasPendingWrites).toBe(false);
  });

  it('clears visible history on logout and ignores a late REST response', async () => {
    await initialize();
    let finish!: (value: unknown) => void;
    vi.mocked(apiRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const request = history.refresh();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    auth.user.set(null);
    TestBed.tick();
    finish({ alerts: [movement] });
    await request;
    expect(history.alerts).toEqual([]);
  });

  it('does not reset the offline queue when the same user receives a refreshed token', async () => {
    await initialize();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    history.createAlert('Movement', 2.5);
    await history.refresh();
    auth.user.set({ uid: 'user-a', email: 'user-a@example.com' });
    TestBed.tick();
    expect(history.hasPendingWrites).toBe(true);
    expect(history.alerts).toHaveLength(1);
  });

  it('ignores other Android owners and acknowledges native records only after the API saves them', async () => {
    await initialize(true);
    history.replaceNativeAlerts([movement], 'other-user');
    expect(history.alerts).toEqual([]);
    native.getState.mockResolvedValue({ alerts: [movement], historyOwner: 'user-a' });
    await history.refresh();
    expect(apiRequest).toHaveBeenCalledWith('/alerts', 'POST', movement, 'test-token');
    expect(native.deleteAlert).toHaveBeenCalledWith({ id: movement.id, userId: 'user-a' });
  });

  it('retains failed native uploads and retries when the API is available', async () => {
    await initialize(true);
    native.getState.mockResolvedValue({ alerts: [movement], historyOwner: 'user-a' });
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Offline'));
    await history.refresh();
    expect(history.alerts).toEqual([movement]);
    expect(native.deleteAlert).not.toHaveBeenCalled();
    await history.refresh();
    expect(native.deleteAlert).toHaveBeenCalledWith({ id: movement.id, userId: 'user-a' });
  });
});
