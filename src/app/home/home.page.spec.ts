import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import { HomePage } from './home.page';
import { NATIVE_ALARM } from './native-alarm';
import type { NativeAlarmState } from './native-alarm';

const NativeAlarm = {
  addListener: vi.fn(),
  getState: vi.fn(),
  importHistory: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  updateAlert: vi.fn(),
  createTestAlert: vi.fn(),
};

const idle: NativeAlarmState = { state: 'idle', countdown: 5, strength: 0, message: '', alerts: [] };
const savedAlert = {
  id: 'native-movement',
  createdAt: '2026-11-02T00:00:00.000Z',
  source: 'Movement' as const,
  status: 'New' as const,
  strength: 2.5,
};

describe('HomePage Android integration', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  const removeListener = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(NativeAlarm.getState).mockResolvedValue(idle);
    vi.mocked(NativeAlarm.importHistory).mockResolvedValue(undefined);
    vi.mocked(NativeAlarm.addListener).mockResolvedValue({ remove: removeListener });
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: NATIVE_ALARM, useValue: NativeAlarm }],
    });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    component.nativeAndroid = true;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('arms the native service with the selected sound, vibration, and sensitivity', async () => {
    vi.mocked(NativeAlarm.start).mockResolvedValue(undefined);
    vi.mocked(NativeAlarm.getState).mockResolvedValue({ ...idle, state: 'countdown' });
    component.settings.soundEnabled = false;
    component.settings.threshold = 0.9;
    await component.startMonitoring();
    expect(NativeAlarm.start).toHaveBeenCalledWith({ threshold: 0.9, soundEnabled: false, vibrationEnabled: true });
    expect(component.settings.state).toBe('countdown');
  });

  it('keeps native monitoring active when the activity is hidden or destroyed', () => {
    component.settings.state = 'armed';
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    component.onVisibilityChange();
    expect(component.settings.state).toBe('armed');
    fixture.destroy();
    expect(removeListener).toHaveBeenCalled();
    expect(NativeAlarm.stop).not.toHaveBeenCalled();
  });

  it('restores background-created alerts when the app returns to the screen', async () => {
    vi.mocked(NativeAlarm.getState).mockResolvedValue({
      ...idle,
      state: 'alert',
      alerts: [savedAlert],
      threshold: 0.9,
      soundEnabled: false,
      vibrationEnabled: false,
    });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    component.onVisibilityChange();
    await fixture.whenStable();
    expect(component.settings.state).toBe('alert');
    expect(component.history.alerts).toEqual([savedAlert]);
    expect(component.settings.threshold).toBe(0.9);
    expect(component.settings.soundEnabled).toBe(false);
    expect(component.settings.vibrationEnabled).toBe(false);
  });

  it('stops the native service only when the user asks to stop', async () => {
    vi.mocked(NativeAlarm.stop).mockResolvedValue(idle);
    component.settings.state = 'alert';
    await component.stopMonitoring();
    expect(NativeAlarm.stop).toHaveBeenCalledOnce();
    expect(component.settings.state).toBe('idle');
  });

  it('shows notification permission errors and returns to idle', async () => {
    vi.mocked(NativeAlarm.start).mockRejectedValue(new Error('Allow notifications in Android settings.'));
    await component.startMonitoring();
    expect(component.sensorError).toContain('Allow notifications');
    expect(component.settings.state).toBe('idle');
  });

  it('updates Android-owned alerts through the native store', async () => {
    vi.mocked(NativeAlarm.updateAlert).mockResolvedValue({ ...idle, alerts: [{ ...savedAlert, status: 'Reviewed' }] });
    await component.history.toggleStatus(savedAlert);
    expect(NativeAlarm.updateAlert).toHaveBeenCalledWith({ id: savedAlert.id, status: 'Reviewed' });
    expect(component.history.alerts[0].status).toBe('Reviewed');
    expect(localStorage.getItem('motion-alarm-alerts')).toBeNull();
  });

  it('keeps the alarm active while Android verification is pending and prevents duplicate requests', async () => {
    let finishVerification!: (snapshot: NativeAlarmState) => void;
    NativeAlarm.stop.mockReturnValue(
      new Promise<NativeAlarmState>((resolve) => {
        finishVerification = resolve;
      }),
    );
    component.settings.state = 'alert';
    const stopping = component.stopMonitoring();
    expect(component.isDisarming).toBe(true);
    expect(component.settings.state).toBe('alert');
    await component.stopMonitoring();
    expect(NativeAlarm.stop).toHaveBeenCalledOnce();
    finishVerification(idle);
    await stopping;
    expect(component.isDisarming).toBe(false);
    expect(component.settings.state).toBe('idle');
  });

  it('keeps monitoring active after canceled verification and allows a retry', async () => {
    component.settings.state = 'armed';
    NativeAlarm.stop.mockRejectedValueOnce(new Error('Verification canceled.'));
    await component.stopMonitoring();
    expect(component.settings.state).toBe('armed');
    expect(component.disarmError).toBe('Verification canceled.');
    expect(component.isDisarming).toBe(false);
    NativeAlarm.stop.mockResolvedValueOnce(idle);
    await component.stopMonitoring();
    expect(component.settings.state).toBe('idle');
    expect(component.disarmError).toBe('');
  });
});
