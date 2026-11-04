import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import type { MovementAlert } from '../home/movement-alert';
import { NATIVE_ALARM } from '../home/native-alarm';
import type { NativeAlarmState } from '../home/native-alarm';

import { AlertHistoryPage } from './alert-history.page';
import { AlertHistoryService } from './alert-history.service';

const savedAlert: MovementAlert = {
  id: 'background-movement',
  createdAt: '2026-11-02T00:00:00.000Z',
  source: 'Movement',
  status: 'New',
  strength: 2.5,
};
const snapshot: NativeAlarmState = { state: 'armed', countdown: 0, strength: 0, message: '', alerts: [savedAlert] };

describe('AlertHistoryPage Android integration', () => {
  let fixture: ComponentFixture<AlertHistoryPage>;
  let component: AlertHistoryPage;
  const nativeAlarm = {
    importHistory: vi.fn(),
    getState: vi.fn(),
    addListener: vi.fn(),
    stop: vi.fn(),
    deleteAlert: vi.fn(),
  };
  const removeListener = vi.fn().mockResolvedValue(undefined);
  const history = {
    nativeAndroid: true,
    alerts: [] as MovementAlert[],
    loadingHistory: false,
    storageError: '',
    hasPendingWrites: false,
    offline: () => false,
    showingCache: () => false,
    isNativePending: () => false,
    refresh: vi.fn(async () => {
      try {
        history.alerts = (await nativeAlarm.getState()).alerts;
      } catch (error) {
        history.storageError = (error as Error).message;
      }
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('motion-alarm-alerts', JSON.stringify([{ ...savedAlert, id: 'legacy-alert' }]));
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    nativeAlarm.importHistory.mockResolvedValue(undefined);
    nativeAlarm.getState.mockResolvedValue(snapshot);
    nativeAlarm.addListener.mockResolvedValue({ remove: removeListener });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: NATIVE_ALARM, useValue: nativeAlarm },
        { provide: AlertHistoryService, useValue: history },
      ],
    });
    fixture = TestBed.createComponent(AlertHistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.ionViewWillEnter();
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads history when opened before the monitor without assigning legacy logs to an account', () => {
    expect(nativeAlarm.importHistory).not.toHaveBeenCalled();
    expect(component.history.alerts).toEqual([savedAlert]);
    expect(component.history.loadingHistory).toBe(false);
  });

  it('refreshes background changes on every visit without stopping the monitor', async () => {
    nativeAlarm.getState.mockResolvedValue({ ...snapshot, alerts: [] });
    component.ionViewWillEnter();
    await fixture.whenStable();
    expect(component.history.alerts).toEqual([]);
    expect(nativeAlarm.importHistory).not.toHaveBeenCalled();
    fixture.destroy();
    expect(removeListener).toHaveBeenCalled();
    expect(nativeAlarm.stop).not.toHaveBeenCalled();
  });

  it('reports native storage errors without discarding already loaded alerts', async () => {
    nativeAlarm.getState.mockRejectedValue(new Error('Android storage is unavailable.'));
    component.ionViewWillEnter();
    await fixture.whenStable();
    expect(component.history.alerts).toEqual([savedAlert]);
    expect(component.history.storageError).toBe('Android storage is unavailable.');
  });
});
