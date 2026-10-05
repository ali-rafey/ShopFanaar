// "New order" sound, played in an open admin window when an order arrives.
// The same file is installed on the owner's iPhone as the Default Alert
// tone, so notifications and the open admin sound alike.
const ORDER_SOUND_URL = "/sounds/new-order.mp3";
const MUTE_KEY = "fanaar-admin-mute";

let audio = null;
const getAudio = () => {
  if (!audio) {
    audio = new Audio(ORDER_SOUND_URL);
    audio.preload = "auto";
  }
  return audio;
};

// iPhone only lets a page play sound after a tap. Prime the shared audio
// element on the first tap so later order alerts can play on their own.
export function unlockAudioOnFirstTap() {
  const unlock = () => {
    const a = getAudio();
    a.muted = true;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
      })
      .catch(() => {})
      .finally(() => {
        a.muted = false;
      });
    document.removeEventListener("pointerdown", unlock, true);
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
  a.currentTime = 0;
  a.play().catch(() => {});
}
