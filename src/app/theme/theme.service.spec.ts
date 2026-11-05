import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let dark: boolean;
  let systemChange: (() => void) | undefined;
  let removeListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.removeItem('motion-alarm-theme');
    dark = false;
    removeListener = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          get matches() {
            return dark;
          },
          addEventListener: (_event: string, listener: () => void) => {
            systemChange = listener;
          },
          removeEventListener: removeListener,
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.removeItem('motion-alarm-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the device until an explicit mode is selected, then can follow it again', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.mode()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBe('light');

    dark = true;
    systemChange?.();
    expect(document.documentElement.dataset['theme']).toBe('dark');

    service.setMode('light');
    systemChange?.();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('motion-alarm-theme')).toBe('light');

    service.setMode('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('restores a saved mode even when it differs from the device', () => {
    localStorage.setItem('motion-alarm-theme', 'dark');
    const service = TestBed.inject(ThemeService);
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('falls back to the device when the saved value is invalid', () => {
    localStorage.setItem('motion-alarm-theme', 'unknown');
    dark = true;
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('applies the theme when storage cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    const service = TestBed.inject(ThemeService);
    service.setMode('dark');
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('updates other tabs and returns to the device theme when storage is cleared', () => {
    const service = TestBed.inject(ThemeService);
    localStorage.setItem('motion-alarm-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'motion-alarm-theme', newValue: 'dark' }));
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    localStorage.removeItem('motion-alarm-theme');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(service.mode()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('removes device listeners when destroyed', () => {
    TestBed.inject(ThemeService);
    TestBed.resetTestingModule();
    expect(removeListener).toHaveBeenCalledWith('change', systemChange);
  });
});
