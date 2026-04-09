// Web Audio API beep for rest timer completion
let audioContext: AudioContext | null = null;

export async function initAudioContext(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

export async function playBeep(): Promise<void> {
  try {
    const ctx = await initAudioContext();
    if (!ctx || ctx.state !== "running") return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = 880; // A5 note
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch {
    // Silently fail - no beep available
  }
}