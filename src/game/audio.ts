import { WeatherMode } from './types';

export interface AudioFrameInput {
  rpm: number;
  gear: number;
  speedMs: number;
  throttle: boolean;
  brakingHard: boolean;
  driftIntensity: number;
  onRoad: boolean;
  isBoosting: boolean;
  tunnelFactor: number;
  weather: WeatherMode;
  active: boolean;
}

export class RaceAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private tunnelSend: GainNode | null = null;

  // Engine synth
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Tire screech
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  // Speed wind noise
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Nitro boost sound
  private boostFilter: BiquadFilterNode | null = null;
  private boostGain: GainNode | null = null;
  private boostOsc: OscillatorNode | null = null;
  private boostOscGain: GainNode | null = null;

  // Rain ambience
  private rainGain: GainNode | null = null;

  private muted = false;
  private started = false;
  private lastGear = 1;
  private shiftDipUntil = 0;
  private lastCollisionAt = 0;

  public init(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.85;
      master.connect(ctx.destination);
      this.masterGain = master;

      const dryBus = ctx.createGain();
      dryBus.gain.value = 1.0;
      dryBus.connect(master);
      this.dryBus = dryBus;

      // Procedural Tunnel Echo / Reverb Convolver Bus
      const irLen = Math.floor(ctx.sampleRate * 0.72);
      const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = irBuf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < irLen; i++) {
          const t = i / irLen;
          const env = Math.pow(1 - t, 2.2) * (i < 160 ? i / 160 : 1);
          const raw = (Math.random() * 2 - 1) * env;
          lp = lp * 0.58 + raw * 0.42;
          data[i] = lp * 0.85;
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = irBuf;

      const tunnelSend = ctx.createGain();
      tunnelSend.gain.value = 0;
      const tunnelReturn = ctx.createGain();
      tunnelReturn.gain.value = 0.62;
      tunnelSend.connect(convolver);
      convolver.connect(tunnelReturn);
      tunnelReturn.connect(master);
      this.tunnelSend = tunnelSend;

      // 1. Multi-harmonic Engine Synth
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      oscSub.type = 'triangle';
      osc1.frequency.value = 58;
      osc2.frequency.value = 116;
      oscSub.frequency.value = 29;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.55;
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.38;

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 600;
      engineFilter.Q.value = 1.8;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;

      osc1.connect(engineFilter);
      osc2.connect(osc2Gain);
      osc2Gain.connect(engineFilter);
      oscSub.connect(subGain);
      subGain.connect(engineFilter);

      engineFilter.connect(engineGain);
      engineGain.connect(dryBus);
      engineGain.connect(tunnelSend);

      osc1.start();
      osc2.start();
      oscSub.start();

      this.osc1 = osc1;
      this.osc2 = osc2;
      this.oscSub = oscSub;
      this.engineFilter = engineFilter;
      this.engineGain = engineGain;

      // Shared white/pink noise buffer for Tire Screech, Wind, Boost & Rain
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      // 2. Tire Screech / Gravel Skid
      const screechSrc = ctx.createBufferSource();
      screechSrc.buffer = noiseBuffer;
      screechSrc.loop = true;

      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1420;
      screechFilter.Q.value = 5.2;

      const screechGain = ctx.createGain();
      screechGain.gain.value = 0;

      screechSrc.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(dryBus);
      screechGain.connect(tunnelSend);
      screechSrc.start();

      this.screechFilter = screechFilter;
      this.screechGain = screechGain;

      // 3. Speed Wind Rush
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuffer;
      windSrc.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 320;
      windFilter.Q.value = 0.85;

      const windGain = ctx.createGain();
      windGain.gain.value = 0;

      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(dryBus);
      windSrc.start();

      this.windFilter = windFilter;
      this.windGain = windGain;

      // 4. Nitro Boost Jet Layer
      const boostSrc = ctx.createBufferSource();
      boostSrc.buffer = noiseBuffer;
      boostSrc.loop = true;

      const boostFilter = ctx.createBiquadFilter();
      boostFilter.type = 'bandpass';
      boostFilter.frequency.value = 950;
      boostFilter.Q.value = 1.6;

      const boostGain = ctx.createGain();
      boostGain.gain.value = 0;

      boostSrc.connect(boostFilter);
      boostFilter.connect(boostGain);
      boostGain.connect(dryBus);
      boostGain.connect(tunnelSend);
      boostSrc.start();

      const boostOsc = ctx.createOscillator();
      boostOsc.type = 'sawtooth';
      boostOsc.frequency.value = 165;
      const boostOscGain = ctx.createGain();
      boostOscGain.gain.value = 0;
      boostOsc.connect(boostOscGain);
      boostOscGain.connect(dryBus);
      boostOscGain.connect(tunnelSend);
      boostOsc.start();

      this.boostFilter = boostFilter;
      this.boostGain = boostGain;
      this.boostOsc = boostOsc;
      this.boostOscGain = boostOscGain;

      // 5. Ambient Rain Bed
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = noiseBuffer;
      rainSrc.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'lowpass';
      rainFilter.frequency.value = 2600;
      rainFilter.Q.value = 0.5;

      const rainHp = ctx.createBiquadFilter();
      rainHp.type = 'highpass';
      rainHp.frequency.value = 550;

      const rainGain = ctx.createGain();
      rainGain.gain.value = 0;

      rainSrc.connect(rainHp);
      rainHp.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(dryBus);
      rainSrc.start();

      this.rainGain = rainGain;
      this.started = true;
    } catch {
      // Ignore Web Audio errors on restricted devices
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public update(input: AudioFrameInput): void {
    if (
      !this.ctx ||
      !this.osc1 ||
      !this.osc2 ||
      !this.oscSub ||
      !this.engineFilter ||
      !this.engineGain ||
      !this.screechGain ||
      !this.screechFilter ||
      !this.windFilter ||
      !this.windGain ||
      !this.boostFilter ||
      !this.boostGain ||
      !this.boostOsc ||
      !this.boostOscGain ||
      !this.rainGain ||
      !this.tunnelSend
    ) {
      return;
    }

    const now = this.ctx.currentTime;

    // Rain ambience plays softly even on title/finish when rain weather is active
    const rainTarget =
      input.weather === 'rain' ? (input.active ? 0.055 : 0.032) * (1 - 0.65 * input.tunnelFactor) : 0;
    this.rainGain.gain.setTargetAtTime(rainTarget, now, 0.25);

    // Tunnel echo send scales smoothly inside the Mountain Tunnel
    this.tunnelSend.gain.setTargetAtTime(input.tunnelFactor * 0.85, now, 0.12);

    if (!input.active) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain.gain.setTargetAtTime(0, now, 0.05);
      this.windGain.gain.setTargetAtTime(0, now, 0.08);
      this.boostGain.gain.setTargetAtTime(0, now, 0.06);
      this.boostOscGain.gain.setTargetAtTime(0, now, 0.06);
      this.lastGear = 1;
      return;
    }

    // Detect upshift for realistic torque & RPM dip
    if (input.gear > this.lastGear && input.speedMs > 10) {
      this.shiftDipUntil = now + 0.125;
      this.playGearShiftPop();
    }
    this.lastGear = input.gear;
    const isShifting = now < this.shiftDipUntil;

    // Pitch follows RPM + slight gear step character
    const gearWeight = 1 + (input.gear - 1) * 0.06;
    const shiftPitchScale = isShifting ? 0.84 : 1.0;
    const boostPitch = input.isBoosting ? 1.14 : 1.0;
    const baseFreq = (48 + input.rpm * 148) * gearWeight * shiftPitchScale * boostPitch;

    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.025);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.99, now, 0.025);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.025);

    const cutoff =
      (410 + input.rpm * 1450 + (input.throttle ? 360 : 0) + (input.isBoosting ? 550 : 0)) *
      (isShifting ? 0.72 : 1.0);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.035);

    const engineVol =
      (input.throttle ? 0.085 + input.rpm * 0.055 : 0.04) * (isShifting ? 0.58 : 1.0);
    this.engineGain.gain.setTargetAtTime(engineVol, now, 0.035);

    // Tire screech when drifting OR braking hard on asphalt
    const brakeSlip =
      input.brakingHard && input.speedMs > 10 ? Math.min(0.65, (input.speedMs - 10) / 38) : 0;
    const totalSlip = Math.max(input.driftIntensity, brakeSlip);
    const screechLevel = input.onRoad
      ? Math.min(0.095, totalSlip * 0.092)
      : Math.min(0.055, totalSlip * 0.052);
    this.screechFilter.frequency.setTargetAtTime(
      input.onRoad ? 1400 + totalSlip * 460 : 270,
      now,
      0.04,
    );
    this.screechFilter.Q.setTargetAtTime(input.onRoad ? 5.0 : 1.1, now, 0.04);
    this.screechGain.gain.setTargetAtTime(screechLevel, now, 0.03);

    // Speed-driven wind noise (rises above ~55 km/h)
    const speedFactor = Math.max(0, Math.min(1.2, (input.speedMs - 15) / 75));
    const windVol = speedFactor * speedFactor * 0.062;
    this.windFilter.frequency.setTargetAtTime(280 + speedFactor * 920, now, 0.08);
    this.windGain.gain.setTargetAtTime(windVol, now, 0.08);

    // Nitro boost sound
    const boostVol = input.isBoosting ? 0.115 : 0;
    this.boostFilter.frequency.setTargetAtTime(input.isBoosting ? 1250 + input.rpm * 650 : 650, now, 0.04);
    this.boostGain.gain.setTargetAtTime(boostVol, now, 0.04);
    this.boostOsc.frequency.setTargetAtTime(160 + input.rpm * 140, now, 0.04);
    this.boostOscGain.gain.setTargetAtTime(input.isBoosting ? 0.042 : 0, now, 0.04);
  }

  private playGearShiftPop(): void {
    if (!this.ctx || !this.dryBus || !this.tunnelSend || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.085);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.tunnelSend);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playCollision(impactStrength = 0.7): void {
    if (!this.ctx || !this.dryBus || !this.tunnelSend || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCollisionAt < 0.14) return;
    this.lastCollisionAt = now;

    const amp = Math.max(0.25, Math.min(1.0, impactStrength));

    // Low-frequency chassis thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132 + amp * 35, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);

    gain.gain.setValueAtTime(0.24 * amp, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.21);

    osc.connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.tunnelSend);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'sawtooth' : 'triangle';
    osc.frequency.value = isGo ? 880 : 440;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isGo ? 0.13 : 0.1, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (isGo ? 0.34 : 0.18));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.36 : 0.2));
  }

  public playChime(kind: 'start' | 'lap' | 'best' | 'finish' | 'lose'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const notes =
      kind === 'finish'
        ? [523.25, 659.25, 783.99, 1046.5]
        : kind === 'lose'
          ? [392.0, 329.63, 261.63]
          : kind === 'best'
            ? [587.33, 880, 1174.66]
            : kind === 'lap'
              ? [523.25, 783.99]
              : [440, 659.25];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = now + idx * 0.075;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  public playTrainHorn(distanceMeters = 60): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    if (distanceMeters > 380) return;
    const now = this.ctx.currentTime;
    const distAtten = Math.max(0.06, Math.min(1.0, 1 - (distanceMeters - 30) / 350));

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1150 + distAtten * 650;

    const hornGain = this.ctx.createGain();
    hornGain.gain.setValueAtTime(0.0001, now);
    hornGain.gain.exponentialRampToValueAtTime(0.11 * distAtten, now + 0.08);
    hornGain.gain.setValueAtTime(0.1 * distAtten, now + 0.72);
    hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.92);
    hornGain.gain.setValueAtTime(0.0001, now + 1.05);
    hornGain.gain.exponentialRampToValueAtTime(0.11 * distAtten, now + 1.12);
    hornGain.gain.setValueAtTime(0.1 * distAtten, now + 1.85);
    hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.18);

    filter.connect(hornGain);
    hornGain.connect(this.masterGain);

    for (const freq of [311.13, 392.0, 466.16]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 2.22);
    }
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.started = false;
  }
}
