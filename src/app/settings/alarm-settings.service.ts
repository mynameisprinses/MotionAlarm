import { Injectable } from '@angular/core';

import type { NativeAlarmState } from '../home/native-alarm';

@Injectable({ providedIn: 'root' })
export class AlarmSettingsService {
  state: 'idle' | 'starting' | 'countdown' | 'armed' | 'alert' = 'idle';
  threshold = 1.8;
  soundEnabled = true;
  vibrationEnabled = true;

  applyNativeSettings(snapshot: NativeAlarmState): void {
    this.state = snapshot.state;
    if (snapshot.threshold !== undefined) {
      this.threshold = snapshot.threshold;
    }
    if (snapshot.soundEnabled !== undefined) {
      this.soundEnabled = snapshot.soundEnabled;
    }
    if (snapshot.vibrationEnabled !== undefined) {
      this.vibrationEnabled = snapshot.vibrationEnabled;
    }
  }
}
