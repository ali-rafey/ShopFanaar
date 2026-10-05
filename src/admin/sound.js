// "New order" sound, played in an open admin window when an order arrives.
// Drop the shop's own sound in public/sounds/ and set ORDER_SOUND_URL to it;
// until then a short two-note chime is synthesised.
const ORDER_SOUND_URL = null; // e.g. "/sounds/new-order.mp3"
const MUTE_KEY = "fanaar-admin-mute";

export const isMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setMuted = (muted) => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
};

export function playOrderSound() {
  if (isMuted()) return;
  if (ORDER_SOUND_URL) {
    new Audio(ORDER_SOUND_URL).play().catch(() => {});
    return;
  }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [
      [987.77, 0], // B5
      [1318.51, 0.13], // E6
    ].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* audio blocked until the page has been tapped once */
  }
}
