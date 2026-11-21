// Every sound in Sunset Bay is synthesized live with WebAudio: an engine
// hum that follows the car's speed, a two-tone police siren, pickup blips
// and a slow bass loop. No audio files are loaded, and sound is optional:
// if the audio context cannot start, the game plays on silently.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.sirenHigh = false;
    this.sirenClock = 0;
    this.muted = false;
    this.bassTimer = null;
    this.bassStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.4;
      this.master.connect(this.ctx.destination);

      // Engine: a low sawtooth through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();

      // Siren: a square wave flipping between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();

      // Bass loop: a slow minor-key pulse, one note every 240 ms.
      const notes = [55, 0, 55, 65.41, 0, 55, 49, 58.27];
      this.bassTimer = window.setInterval(() => {
        if (!this.ctx || this.muted) return;
        const f = notes[this.bassStep % notes.length];
        this.bassStep += 1;
        if (!f) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.15, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
        o.connect(g);
        g.connect(this.master);
        o.start();
        o.stop(this.ctx.currentTime + 0.24);
      }, 240);
    } catch {
      // Sound is optional; the game plays on without it.
    }
  }

  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 115, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.02 + speed01 * 0.05 : 0, t, 0.1);
  }

  setSiren(on) {
    this.sirenOn = on;
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.035 : 0, this.ctx.currentTime, 0.1);
  }

  update(dt) {
    if (!this.ctx || !this.sirenOsc) return;
    if (this.sirenOn) {
      this.sirenClock += dt;
      if (this.sirenClock > 0.45) {
        this.sirenClock = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.value = this.sirenHigh ? 960 : 720;
      }
    }
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(this.ctx.currentTime + dur + 0.02);
    } catch {
      // Ignore audio errors; the game continues.
    }
  }

  blip() { this.tone(880, 0.09, 'sine', 0.18); }
  cash() { this.tone(880, 0.1, 'sine', 0.2); window.setTimeout(() => this.tone(1318, 0.16, 'sine', 0.2), 90); }
  punch() { this.tone(190, 0.12, 'square', 0.16, 90); }
  thud() { this.tone(120, 0.22, 'sine', 0.3, 45); }
  busted() { this.tone(520, 0.4, 'sawtooth', 0.14, 180); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.value = this.muted ? 0 : 0.4;
    }
    return this.muted;
  }
}
