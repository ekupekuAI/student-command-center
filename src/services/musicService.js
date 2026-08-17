/**
 * musicService.js — Ambient background music
 *
 * Owns a single looping <audio> element for the study-ambient track and
 * persists play/mute/volume preferences in localStorage. Playback never
 * starts on its own: a stored "playing" preference is only restored on the
 * next user gesture (see armAutoresume), and the track always begins paused
 * so the app never blasts sound on first visit.
 */

const STORAGE_KEYS = {
  volume: 'scc-music-volume',
  muted: 'scc-music-muted',
  playing: 'scc-music-playing',
};

const DEFAULT_VOLUME = 0.5;

const clamp01 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
};

function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode / quota) — preferences just won't persist.
  }
}

class MusicService {
  constructor() {
    this._volume = clamp01(readPref(STORAGE_KEYS.volume, DEFAULT_VOLUME));
    this._muted = !!readPref(STORAGE_KEYS.muted, false);
    this._playing = !!readPref(STORAGE_KEYS.playing, false);
    this._audio = null;
    this._autoresumeArmed = false;
    this._onGesture = null;
    this._subs = new Set();
  }

  /** Report the ACTUAL playback state (the element, when it exists, is the truth). */
  getState() {
    const a = this._audio;
    return {
      playing: !!a && !a.paused && !a.ended,
      muted: this._muted,
      volume: this._volume,
    };
  }

  /** Subscribe to state changes (fired on play/pause/mute/volume/error). */
  onChange(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  _notify() {
    const state = this.getState();
    this._subs.forEach((fn) => {
      try { fn(state); } catch { /* ignore subscriber errors */ }
    });
  }

  _ensureAudio() {
    if (this._audio) return this._audio;
    const audio = new Audio();
    audio.src = `${import.meta.env.BASE_URL}audio/study-ambient.wav`;
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = this._muted ? 0 : this._volume;
    // Attach to the DOM: detached <audio> elements can fail to produce sound on
    // iOS Safari / some Android browsers. Hidden, never visible.
    audio.style.position = 'absolute';
    audio.style.left = '-9999px';
    audio.style.visibility = 'hidden';
    audio.setAttribute('aria-hidden', 'true');
    document.body.appendChild(audio);
    audio.addEventListener('playing', () => this._notify());
    audio.addEventListener('pause', () => this._notify());
    audio.addEventListener('error', () => {
      this._playing = false;
      writePref(STORAGE_KEYS.playing, false);
      this._notify();
    });
    this._audio = audio;
    return audio;
  }

  /** Start playback. Returns true when playback actually begins. */
  async play() {
    this._playing = true;
    writePref(STORAGE_KEYS.playing, true);
    this.disarmAutoresume();
    try {
      await this._ensureAudio().play();
      this._notify();
      return true;
    } catch (err) {
      if (err && err.name === 'NotAllowedError') {
        // Browser blocked autoplay — keep the preference and retry on the next
        // user gesture instead of starting (or claiming to start) silently.
        this._playing = false;
        writePref(STORAGE_KEYS.playing, true);
        this.armAutoresume();
        this._notify();
        return false;
      }
      this._playing = false;
      writePref(STORAGE_KEYS.playing, false);
      this._notify();
      return false;
    }
  }

  pause() {
    this._playing = false;
    writePref(STORAGE_KEYS.playing, false);
    this.disarmAutoresume();
    if (this._audio) this._audio.pause();
    this._notify();
  }

  /** Play/pause toggle, based on what the element is ACTUALLY doing. */
  toggle() {
    const a = this._audio;
    const actuallyPlaying = !!a && !a.paused && !a.ended;
    if (actuallyPlaying) {
      this.pause();
      return false;
    }
    return this.play();
  }

  /** Set volume (0–1) and unmute, since dragging the slider is a request to hear. */
  setVolume(value) {
    this._volume = clamp01(value);
    writePref(STORAGE_KEYS.volume, this._volume);
    if (this._audio && !this._muted) this._audio.volume = this._volume;
    if (this._muted) this.setMuted(false);
    this._notify();
  }

  setMuted(muted) {
    this._muted = !!muted;
    writePref(STORAGE_KEYS.muted, this._muted);
    if (this._audio) this._audio.volume = this._muted ? 0 : this._volume;
    this._notify();
  }

  toggleMute() {
    this.setMuted(!this._muted);
  }

  /** Stop playback and forget the "playing" preference (used on logout). */
  stop() {
    this._playing = false;
    writePref(STORAGE_KEYS.playing, false);
    this.disarmAutoresume();
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }
    this._notify();
  }

  /**
   * Restore a stored "playing" preference on the next user gesture instead of
   * autoplaying. Called whenever the app shell mounts; only has an effect when
   * the user previously had music playing. `onResumed` is invoked once
   * playback actually begins so callers can refresh their UI.
   */
  armAutoresume(onResumed) {
    if (this._autoresumeArmed || !this._playing || typeof window === 'undefined') return;
    this._autoresumeArmed = true;
    this._onGesture = (evt) => {
      if (!this._playing) return;
      // Let the floating control handle its own clicks (play/pause, mute,
      // volume) — only resume for gestures anywhere else in the app.
      if (evt.target instanceof Element && evt.target.closest('.music-fab')) return;
      this._ensureAudio()
        .play()
        .then(() => onResumed && onResumed())
        .catch(() => {});
    };
    window.addEventListener('pointerdown', this._onGesture, { once: true });
    window.addEventListener('keydown', this._onGesture, { once: true });
  }

  disarmAutoresume() {
    this._autoresumeArmed = false;
    if (this._onGesture && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._onGesture);
      window.removeEventListener('keydown', this._onGesture);
      this._onGesture = null;
    }
  }
}

export const musicService = new MusicService();
export default musicService;