// Browsers use a generated tone. The Android service uses the phone's alarm sound.
export class AlarmSound {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private volume: GainNode | null = null;
  private toneTimer: number | null = null;
  private previewTimer: number | null = null;

  async prepare(): Promise<void> {
    if (this.context === null) {
      this.context = new AudioContext();
    }
    await this.context.resume();
  }

  start(preview = false): void {
    this.stop();
    if (this.context === null || this.context.state !== 'running') {
      throw new Error('Alarm sound could not start. Check your browser audio permission.');
    }
    this.oscillator = this.context.createOscillator();
    this.volume = this.context.createGain();
    this.oscillator.type = 'square';
    this.oscillator.frequency.value = 880;
    this.volume.gain.value = 0.08;
    this.oscillator.connect(this.volume);
    this.volume.connect(this.context.destination);
    this.oscillator.start();
    let highNote = true;
    this.toneTimer = window.setInterval(() => {
      highNote = !highNote;
      if (this.oscillator) {
        if (highNote) {
          this.oscillator.frequency.value = 880;
        } else {
          this.oscillator.frequency.value = 660;
        }
      }
    }, 450);
    if (preview) {
      this.previewTimer = window.setTimeout(() => {
        this.stop();
      }, 2000);
    }
  }

  stop(): void {
    if (this.toneTimer !== null) {
      window.clearInterval(this.toneTimer);
    }
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
    }
    this.toneTimer = null;
    this.previewTimer = null;
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.volume) {
      this.volume.disconnect();
    }
    this.volume = null;
  }

  dispose(): void {
    this.stop();
    if (this.context) {
      void this.context.close();
    }
    this.context = null;
  }
}
