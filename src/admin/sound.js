// "New order" sound, played in an open admin window when an order arrives.
// The same file is installed on the owner's iPhone as the Default Alert
// tone, so notifications and the open admin sound alike.
const ORDER_SOUND_URL = "/sounds/new-order.mp3";
const MUTE_KEY = "fanaar-admin-mute";

// 50 ms of digital silence as a WAV. iPhone only lets a page play sound
// after a tap, and the permission sticks to the <audio> element that played
// during that tap — so the first tap plays this clip (which cannot make a
// sound) on the shared element, and the element then switches to the order
// sound for later alerts. Playing the order sound itself muted, as before,
// still let a blip of it through on iPhone when the admin app opened.
const SILENCE =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACA" +
  "gICA".repeat(133); // 400 samples at the zero level (0x80)

let audio = null;
const getAudio = () => {
  if (!audio) {
    audio = new Audio(ORDER_SOUND_URL);
    audio.preload = "auto";
  }
  return audio;
};

export function unlockAudioOnFirstTap() {
  const unlock = () => {
    document.removeEventListener("pointerdown", unlock, true);
    if (isMuted()) return; // nothing to unlock while the sound is off
    const a = getAudio();
    a.src = SILENCE;
    a.play()
      .catch(() => {})
      .finally(() => {
        a.src = ORDER_SOUND_URL;
        a.load();
      });
  };
  document.addEventListener("pointerdown", unlock, true);
  return () => document.removeEventListener("pointerdown", unlock, true);
}

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
  const a = getAudio();
  if (!a.src.endsWith(ORDER_SOUND_URL)) a.src = ORDER_SOUND_URL; // still on the silent clip
  a.currentTime = 0;
  a.play().catch(() => {});
}
