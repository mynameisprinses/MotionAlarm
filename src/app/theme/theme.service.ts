import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type ThemeMode = 'system' | 'light' | 'dark';
type Theme = Exclude<ThemeMode, 'system'>;

const storageKey = 'motion-alarm-theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);
  private window = this.document.defaultView;
  private systemTheme = this.window?.matchMedia('(prefers-color-scheme: dark)');
  private selectedMode = signal<ThemeMode>('system');
  readonly mode = this.selectedMode.asReadonly();

  constructor() {
    this.selectedMode.set(this.readMode());
    this.applyTheme();

    const onSystemChange = (): void => this.applyTheme();
    const onStorage = (event: StorageEvent): void => {
      if (event.key === storageKey || event.key === null) {
        this.selectedMode.set(this.readMode());
        this.applyTheme();
      }
    };
    this.systemTheme?.addEventListener('change', onSystemChange);
    this.window?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      this.systemTheme?.removeEventListener('change', onSystemChange);
      this.window?.removeEventListener('storage', onStorage);
    });
  }

  setMode(mode: ThemeMode): void {
    this.selectedMode.set(mode);
    this.applyTheme();
    try {
      this.window?.localStorage.setItem(storageKey, mode);
    } catch {
      // The theme still works for this session when device storage is unavailable.
    }
  }

  private readMode(): ThemeMode {
    try {
      const stored = this.window?.localStorage.getItem(storageKey) ?? null;
      return isThemeMode(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private applyTheme(): void {
    const mode = this.mode();
    const theme: Theme = mode === 'system' ? (this.systemTheme?.matches ? 'dark' : 'light') : mode;
    this.document.documentElement.dataset['theme'] = theme;
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#141d18' : '#f6f8f5');
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => undefined);
    }
  }
}
