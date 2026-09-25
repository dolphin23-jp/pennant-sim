/**
 * Ballpark sounds, synthesized with Web Audio: no audio files, nothing to license. The
 * bat, the mitt, the crowd, an organ and the siren are all built from oscillators and
 * filtered noise. Off until the user turns it on, and the audio context is only created
 * after a click, as browsers require.
 */
export type SoundCue =
  | 'bat'
  | 'foul'
  | 'whiff'
  | 'mitt'
  | 'cheer'
  | 'roar'
  | 'groan'
  | 'homeRun'
  | 'chance'
  | 'fanfare'
  | 'win'
  | 'lose'
  | 'siren'
  | 'chime';

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
// Semitones from A4: C5 = 3, D5 = 5, E5 = 7, G5 = 10, A5 = 12, C6 = 15.
const C5 = NOTE(3),
  D5 = NOTE(5),
  E5 = NOTE(7),
  G5 = NOTE(10),
  A5 = NOTE(12),
  C6 = NOTE(15),
  G4 = NOTE(-2),
  B4 = NOTE(2),
  Eb5 = NOTE(6),
  Ab4 = NOTE(-1);

class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowd: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private enabled = false;
  private volume = 0.6;

  configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(enabled ? this.volume : 0, this.context.currentTime, 0.05);
    if (!enabled) this.stopCrowd();
  }

  get isEnabled() {
    return this.enabled;
  }

  /** Creates or resumes the audio context. Call from a click or key handler. */
  unlock(): boolean {
    if (!this.enabled) return false;
    if (!this.context) {
      const Context = audioContextClass();
      if (!Context) return false;
      try {
        this.context = new Context();
      } catch {
        return false;
      }
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return true;
  }

  private ready(): { context: AudioContext; master: GainNode } | null {
    if (!this.enabled || !this.unlock() || !this.context || !this.master) return null;
    return { context: this.context, master: this.master };
  }

  private noiseBuffer(context: AudioContext): AudioBuffer {
    if (!this.noise) {
      const length = context.sampleRate * 2;
      this.noise = context.createBuffer(1, length, context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** A burst of filtered noise with an attack/decay envelope. */
  private burst(
    start: number,
    duration: number,
    peak: number,
    filter: { type: BiquadFilterType; frequency: number; q?: number },
    attack = 0.005,
  ) {
    const ready = this.ready();
    if (!ready) return;
    const { context, master } = ready;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(context);
    source.loop = true;
    const shaping = context.createBiquadFilter();
    shaping.type = filter.type;
    shaping.frequency.value = filter.frequency;
    shaping.Q.value = filter.q ?? 1;
    const gain = context.createGain();
    const at = context.currentTime + start;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(shaping).connect(gain).connect(master);
    source.start(at, Math.random());
    source.stop(at + duration + 0.05);
  }

  /** One tone with a quick envelope; `organ` adds the upper partials of a drawbar organ. */
  private tone(
    start: number,
    frequency: number,
    duration: number,
    peak: number,
    voice: 'organ' | 'sine' | 'triangle' = 'organ',
    endFrequency?: number,
  ) {
    const ready = this.ready();
    if (!ready) return;
    const { context, master } = ready;
    const at = context.currentTime + start;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    gain.gain.setValueAtTime(peak, at + Math.max(0.02, duration - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(master);
    const partials: Array<[number, number]> =
      voice === 'organ'
        ? [
            [1, 1],
            [2, 0.5],
            [3, 0.3],
            [4, 0.15],
          ]
        : [[1, 1]];
    for (const [multiple, level] of partials) {
      const oscillator = context.createOscillator();
      oscillator.type = voice === 'triangle' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency * multiple, at);
      if (endFrequency)
        oscillator.frequency.linearRampToValueAtTime(endFrequency * multiple, at + duration);
      const partialGain = context.createGain();
      partialGain.gain.value = level;
      oscillator.connect(partialGain).connect(gain);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.05);
    }
  }

  private melody(notes: Array<[number, number]>, beat: number, peak = 0.12, start = 0) {
    let time = start;
    for (const [frequency, beats] of notes) {
      if (frequency > 0) this.tone(time, frequency, beats * beat * 0.92, peak);
      time += beats * beat;
    }
  }

  /** A low crowd murmur under a live game; `level` 0-1. */
  startCrowd(level = 0.35) {
    const ready = this.ready();
    if (!ready || this.crowd) return;
    const { context, master } = ready;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(context);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.5;
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.05 * level + 0.0001, context.currentTime + 1.2);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    this.crowd = { source, gain };
  }

  stopCrowd() {
    if (!this.crowd || !this.context) return;
    const { source, gain } = this.crowd;
    gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.3);
    source.stop(this.context.currentTime + 1.2);
    this.crowd = null;
  }

  play(cue: SoundCue) {
    if (!this.ready()) return;
    switch (cue) {
      case 'bat':
        // The crack: a sharp band of noise and a short high ring.
        this.burst(0, 0.09, 0.9, { type: 'bandpass', frequency: 2600, q: 1.4 }, 0.002);
        this.tone(0, 1750, 0.22, 0.05, 'sine', 1500);
        this.tone(0, 190, 0.08, 0.2, 'sine', 90);
        break;
      case 'foul':
        // A glancing tick off the bat and a short murmur.
        this.burst(0, 0.06, 0.5, { type: 'bandpass', frequency: 3200, q: 1.6 }, 0.002);
        this.burst(0.05, 0.6, 0.06, { type: 'bandpass', frequency: 900, q: 0.6 }, 0.1);
        break;
      case 'whiff':
        // The swing cutting air, then the mitt.
        this.burst(0, 0.18, 0.25, { type: 'highpass', frequency: 1800 }, 0.06);
        this.burst(0.16, 0.07, 0.6, { type: 'lowpass', frequency: 900 }, 0.002);
        break;
      case 'mitt':
        this.burst(0, 0.07, 0.6, { type: 'lowpass', frequency: 900 }, 0.002);
        this.tone(0, 130, 0.07, 0.25, 'sine', 70);
        break;
      case 'cheer':
        this.burst(0.05, 1.6, 0.18, { type: 'bandpass', frequency: 1000, q: 0.6 }, 0.25);
        break;
      case 'roar':
        this.burst(0, 3.2, 0.32, { type: 'bandpass', frequency: 900, q: 0.5 }, 0.35);
        this.burst(0.1, 2.6, 0.12, { type: 'highpass', frequency: 2400 }, 0.3);
        break;
      case 'groan':
        this.burst(0, 1.1, 0.1, { type: 'lowpass', frequency: 500 }, 0.15);
        break;
      case 'homeRun':
        this.play('bat');
        this.play('roar');
        this.melody(
          [
            [G5, 1],
            [G5, 1],
            [A5, 1],
            [C6, 3],
          ],
          0.16,
          0.1,
          0.6,
        );
        break;
      case 'chance':
        // An original rising organ call, twice.
        this.melody(
          [
            [C5, 0.5],
            [E5, 0.5],
            [G5, 0.5],
            [E5, 0.5],
            [C5, 0.5],
            [E5, 0.5],
            [G5, 1],
          ],
          0.2,
          0.09,
        );
        break;
      case 'fanfare':
        this.melody(
          [
            [C5, 1],
            [E5, 1],
            [G5, 1],
            [C6, 2],
            [G5, 1],
            [C6, 3],
          ],
          0.17,
          0.12,
        );
        this.play('roar');
        break;
      case 'win':
        this.melody(
          [
            [G4, 1],
            [C5, 1],
            [E5, 1],
            [G5, 2],
            [E5, 1],
            [G5, 1],
            [C6, 3],
          ],
          0.13,
          0.1,
        );
        this.play('cheer');
        break;
      case 'lose':
        this.melody(
          [
            [Eb5, 1.5],
            [D5, 1.5],
            [B4, 1.5],
            [Ab4, 3],
          ],
          0.2,
          0.06,
        );
        break;
      case 'siren':
        this.tone(0, 420, 0.7, 0.08, 'triangle', 760);
        this.tone(0.7, 760, 1.4, 0.08, 'triangle', 760);
        this.tone(2.1, 760, 0.9, 0.08, 'triangle', 380);
        break;
      case 'chime':
        this.tone(0, E5, 0.25, 0.08, 'sine');
        this.tone(0.14, C6, 0.45, 0.08, 'sine');
        break;
    }
  }
}

export const sound = new SoundEngine();

/** Test sounds for the settings sheet, in order. */
export const SOUND_PREVIEW: SoundCue[] = ['bat', 'cheer', 'chance'];
