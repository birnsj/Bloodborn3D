/**
 * Lightweight browser session recorder (Screen Capture API + MediaRecorder).
 * Saves locally as .webm — no uploads or external services.
 */

export const RECORDER_STATUS = {
  idle: 'idle',
  requesting: 'requesting',
  recording: 'recording',
  stopping: 'stopping',
};

const PREFERRED_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function defaultDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the download has a chance to start
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function pickMimeType(MediaRecorderClass, preferred = PREFERRED_MIME_TYPES) {
  if (!MediaRecorderClass?.isTypeSupported) return '';
  for (const type of preferred) {
    if (MediaRecorderClass.isTypeSupported(type)) return type;
  }
  return '';
}

export function formatRecordingElapsed(ms) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function buildRecordingFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
  return `bloodbound-session-${stamp}.webm`;
}

export function isSessionRecorderSupported({
  getDisplayMedia = typeof navigator !== 'undefined'
    ? navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices)
    : null,
  MediaRecorderClass = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null,
} = {}) {
  return typeof getDisplayMedia === 'function' && typeof MediaRecorderClass === 'function';
}

export class SessionRecorder {
  constructor({
    getDisplayMedia = typeof navigator !== 'undefined'
      ? navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices)
      : null,
    /** Optional () => HTMLCanvasElement for viewport-only capture without a picker. */
    getCanvas = null,
    MediaRecorderClass = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null,
    downloadBlob = defaultDownloadBlob,
    now = () => Date.now(),
    preferredMimeTypes = PREFERRED_MIME_TYPES,
    onStateChange = null,
  } = {}) {
    this._getDisplayMedia = getDisplayMedia;
    this._getCanvas = getCanvas;
    this._MediaRecorderClass = MediaRecorderClass;
    this._downloadBlob = downloadBlob;
    this._now = now;
    this._preferredMimeTypes = preferredMimeTypes;
    this._onStateChange = onStateChange;

    this._status = RECORDER_STATUS.idle;
    this._startedAt = 0;
    this._error = null;
    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._trackEndedHandler = null;
    this._stopPromise = null;
    this._sessionGen = 0;
  }

  get status() {
    return this._status;
  }

  get isRecording() {
    return this._status === RECORDER_STATUS.recording;
  }

  getState() {
    const displayOk = isSessionRecorderSupported({
      getDisplayMedia: this._getDisplayMedia,
      MediaRecorderClass: this._MediaRecorderClass,
    });
    const canvasOk = typeof this._getCanvas === 'function'
      && typeof this._MediaRecorderClass === 'function';
    return {
      status: this._status,
      startedAt: this._startedAt,
      elapsedMs: this._startedAt ? Math.max(0, this._now() - this._startedAt) : 0,
      error: this._error,
      supported: displayOk || canvasOk,
    };
  }

  /**
   * @param {{ preferCanvas?: boolean }} [options]
   * preferCanvas skips the OS picker and records the editor WebGL canvas.
   */
  async start(options = {}) {
    if (
      this._status === RECORDER_STATUS.recording
      || this._status === RECORDER_STATUS.requesting
      || this._status === RECORDER_STATUS.stopping
    ) {
      return this.getState();
    }

    this._error = null;
    const preferCanvas = Boolean(options.preferCanvas);
    const canDisplay = typeof this._getDisplayMedia === 'function';
    const canCanvas = typeof this._getCanvas === 'function';
    if ((!canDisplay && !canCanvas) || typeof this._MediaRecorderClass !== 'function') {
      this._error = 'Screen recording is not supported in this browser.';
      this._emit();
      return this.getState();
    }

    const sessionGen = ++this._sessionGen;
    this._setStatus(RECORDER_STATUS.requesting);

    let stream;
    let captureError = null;

    const tryCanvas = () => {
      const canvas = this._getCanvas?.();
      if (!canvas?.captureStream) return null;
      return canvas.captureStream(30);
    };

    if (preferCanvas && canCanvas) {
      try {
        stream = tryCanvas();
      } catch (err) {
        captureError = err;
        stream = null;
      }
    }

    if ((!stream || stream.getVideoTracks().length === 0) && canDisplay && !preferCanvas) {
      try {
        stream = await this._getDisplayMedia({
          video: true,
          audio: false,
          preferCurrentTab: false,
        });
      } catch (err) {
        captureError = err;
        stream = null;
      }
    }

    // Fallback: record the editor WebGL canvas (no OS picker required).
    if ((!stream || stream.getVideoTracks().length === 0) && canCanvas) {
      try {
        stream = tryCanvas();
      } catch (err) {
        captureError = captureError || err;
      }
    }

    if (sessionGen !== this._sessionGen) {
      this._stopTracks(stream);
      return this.getState();
    }

    if (!stream || stream.getVideoTracks().length === 0) {
      this._cleanupMedia();
      this._status = RECORDER_STATUS.idle;
      this._startedAt = 0;
      this._error = captureError
        ? permissionErrorMessage(captureError)
        : 'No video track was provided for capture.';
      this._emit();
      return this.getState();
    }

    this._stream = stream;
    this._chunks = [];
    this._attachTrackEndedHandlers(stream);

    const mimeType = pickMimeType(this._MediaRecorderClass, this._preferredMimeTypes);
    let recorder;
    try {
      recorder = mimeType
        ? new this._MediaRecorderClass(stream, { mimeType })
        : new this._MediaRecorderClass(stream);
    } catch (err) {
      this._cleanupMedia();
      this._status = RECORDER_STATUS.idle;
      this._error = err?.message || 'Failed to start MediaRecorder.';
      this._emit();
      return this.getState();
    }

    this._recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this._chunks.push(event.data);
    };

    try {
      recorder.start(1000);
    } catch (err) {
      this._cleanupMedia();
      this._status = RECORDER_STATUS.idle;
      this._error = err?.message || 'Failed to start recording.';
      this._emit();
      return this.getState();
    }

    this._startedAt = this._now();
    this._setStatus(RECORDER_STATUS.recording);
    return this.getState();
  }

  /**
   * Stop capture. When save=true (default), download a .webm if chunks exist.
   * When save=false, discard chunks (cancel / cleanup).
   */
  async stop({ save = true, filename = null } = {}) {
    // Invalidate any in-flight getDisplayMedia from start()
    this._sessionGen += 1;

    if (this._status === RECORDER_STATUS.idle || this._status === RECORDER_STATUS.requesting) {
      this._cleanupMedia();
      this._status = RECORDER_STATUS.idle;
      this._startedAt = 0;
      if (!save) this._error = null;
      this._emit();
      return { blob: null, filename: null, saved: false };
    }

    if (this._stopPromise) return this._stopPromise;

    this._setStatus(RECORDER_STATUS.stopping);
    this._stopPromise = this._finishStop({ save, filename })
      .finally(() => {
        this._stopPromise = null;
      });
    return this._stopPromise;
  }

  /** Release resources without saving. Safe to call anytime. */
  async dispose() {
    return this.stop({ save: false });
  }

  async _finishStop({ save, filename }) {
    const recorder = this._recorder;
    let blob = null;

    if (recorder && recorder.state !== 'inactive') {
      blob = await new Promise((resolve) => {
        const prev = recorder.onstop;
        recorder.onstop = (ev) => {
          try { prev?.(ev); } catch { /* ignore */ }
          const type = recorder.mimeType || 'video/webm';
          const parts = this._chunks.slice();
          resolve(parts.length ? new Blob(parts, { type }) : null);
        };
        try {
          recorder.stop();
        } catch {
          resolve(this._chunks.length
            ? new Blob(this._chunks, { type: recorder.mimeType || 'video/webm' })
            : null);
        }
      });
    } else if (this._chunks.length) {
      blob = new Blob(this._chunks, { type: 'video/webm' });
    }

    this._cleanupMedia();
    this._status = RECORDER_STATUS.idle;
    this._startedAt = 0;
    this._chunks = [];

    let saved = false;
    let outName = null;
    if (save && blob && blob.size > 0) {
      outName = filename || buildRecordingFilename(new Date(this._now()));
      try {
        this._downloadBlob(blob, outName);
        saved = true;
        this._error = null;
      } catch (err) {
        this._error = err?.message || 'Failed to save recording.';
      }
    }

    this._emit();
    return { blob, filename: outName, saved };
  }

  _attachTrackEndedHandlers(stream) {
    this._trackEndedHandler = () => {
      if (this._status === RECORDER_STATUS.recording) {
        void this.stop({ save: true });
      }
    };
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', this._trackEndedHandler);
    }
  }

  _cleanupMedia() {
    if (this._recorder) {
      try {
        this._recorder.ondataavailable = null;
        this._recorder.onstop = null;
        if (this._recorder.state !== 'inactive') this._recorder.stop();
      } catch { /* already stopped */ }
      this._recorder = null;
    }
    if (this._stream) {
      if (this._trackEndedHandler) {
        for (const track of this._stream.getTracks()) {
          track.removeEventListener('ended', this._trackEndedHandler);
        }
      }
      this._stopTracks(this._stream);
      this._stream = null;
    }
    this._trackEndedHandler = null;
  }

  _stopTracks(stream) {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* ignore */ }
    }
  }

  _setStatus(status) {
    this._status = status;
    this._emit();
  }

  _emit() {
    this._onStateChange?.(this.getState());
  }
}

function permissionErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Screen recording was cancelled or permission was denied.';
  }
  if (name === 'NotFoundError' || name === 'NotReadableError') {
    return 'No screen or window was available to capture.';
  }
  if (name === 'AbortError') {
    return 'Screen recording was cancelled.';
  }
  return err?.message || 'Failed to start screen recording.';
}
