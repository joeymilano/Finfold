/**
 * Completion sound — plays a short chime when an agent reply or a content
 * generation task finishes. The mute preference is remembered per browser.
 *
 * Sound: "Positive notification" (Mixkit License, free for commercial use,
 * no attribution required) — public/sounds/task-complete.mp3
 */

const STORAGE_KEY = "finfold-completion-sound-v1";
const SOUND_SRC = "/sounds/task-complete.mp3";
const SOUND_VOLUME = 0.7;

let cachedAudio: HTMLAudioElement | null = null;

export function isCompletionSoundMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "muted";
  } catch {
    // Private-browsing modes can block localStorage; stay silent rather than noisy.
    return true;
  }
}

export function setCompletionSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "muted" : "on");
  } catch {
    // Ignore — the preference simply won't persist.
  }
}

/**
 * Play the completion chime. Safe to call anywhere on the client: no-ops when
 * muted, before hydration, or when the browser blocks autoplay (the rejection
 * is swallowed on purpose).
 */
export function playTaskCompleteSound(): void {
  if (typeof window === "undefined") return;
  if (isCompletionSoundMuted()) return;

  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(SOUND_SRC);
      cachedAudio.volume = SOUND_VOLUME;
    } else {
      cachedAudio.currentTime = 0;
    }
    const playback = cachedAudio.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        // Autoplay policy or decode failure — stay quiet.
      });
    }
  } catch {
    // Audio unsupported — stay quiet.
  }
}
