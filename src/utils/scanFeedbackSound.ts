/**
 * Короткие звуки для сканирования (один AudioContext, без наслоения).
 */

let sharedCtx: AudioContext | null = null;
let activeOsc: OscillatorNode | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new Ctor();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function stopActiveOsc(): void {
  if (!activeOsc) return;
  const prev = activeOsc;
  activeOsc = null;
  try {
    prev.stop();
  } catch {
    /* уже остановлен */
  }
  try {
    prev.disconnect();
  } catch {
    /* noop */
  }
}

function playBeep(params: {
  frequency: number;
  wave: OscillatorType;
  duration: number;
  peakGain: number;
  attack: number;
}): void {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume().catch(() => {});

  stopActiveOsc();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = params.wave;
  osc.frequency.setValueAtTime(params.frequency, ctx.currentTime);
  const t0 = ctx.currentTime;
  const t1 = t0 + params.attack;
  const t2 = t0 + params.duration;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(params.peakGain, 0.0001), t1);
  gain.gain.exponentialRampToValueAtTime(0.0001, t2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  activeOsc = osc;
  osc.onended = () => {
    if (activeOsc === osc) activeOsc = null;
    try {
      gain.disconnect();
    } catch {
      /* noop */
    }
  };
  osc.start(t0);
  osc.stop(t2 + 0.001);
}

/** Успешное сканирование — короткий мягкий «пик». */
export function playScanSuccessSound(): void {
  playBeep({
    frequency: 920,
    wave: "sine",
    duration: 0.1,
    peakGain: 0.12,
    attack: 0.012,
  });
}

/** Ошибка сканирования — резкий сигнал. */
export function playScanErrorSound(): void {
  playBeep({
    frequency: 200,
    wave: "square",
    duration: 0.2,
    peakGain: 0.08,
    attack: 0.018,
  });
}
