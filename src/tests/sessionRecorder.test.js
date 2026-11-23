import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SessionRecorder,
  RECORDER_STATUS,
  buildRecordingFilename,
  formatRecordingElapsed,
  isSessionRecorderSupported,
} from '../editor/sessionRecorder/SessionRecorder.js';

function createMockTrack() {
  const listeners = new Map();
  return {
    kind: 'video',
    readyState: 'live',
    stop: vi.fn(function stop() {
      this.readyState = 'ended';
      for (const fn of listeners.get('ended') || []) fn();
    }),
    addEventListener: vi.fn((type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    }),
    removeEventListener: vi.fn((type, fn) => {
      listeners.get(type)?.delete(fn);
    }),
    _emit(type) {
      for (const fn of listeners.get(type) || []) fn();
    },
  };
}

function createMockStream(track = createMockTrack()) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

function createMockMediaRecorderClass({ failStart = false } = {}) {
  class MockMediaRecorder {
    static isTypeSupported(type) {
      return String(type).startsWith('video/webm');
    }

    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'video/webm';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }

    start() {
      if (failStart) throw new Error('start failed');
      this.state = 'recording';
      this.ondataavailable?.({ data: new Blob(['frame'], { type: this.mimeType }) });
    }

    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['tail'], { type: this.mimeType }) });
      this.onstop?.({});
    }
  }
  return MockMediaRecorder;
}

describe('session recorder helpers', () => {
  it('formats elapsed time', () => {
    expect(formatRecordingElapsed(0)).toBe('00:00');
    expect(formatRecordingElapsed(1500)).toBe('00:01');
    expect(formatRecordingElapsed(125000)).toBe('02:05');
  });

  it('builds a webm filename', () => {
    const name = buildRecordingFilename(new Date('2026-11-22T15:04:05'));
    expect(name).toMatch(/^bloodbound-session-\d{8}-\d{6}\.webm$/);
  });

  it('detects unsupported environments', () => {
    expect(isSessionRecorderSupported({
      getDisplayMedia: null,
      MediaRecorderClass: null,
    })).toBe(false);
  });
});

describe('SessionRecorder', () => {
  let downloads;
  let now;

  beforeEach(() => {
    downloads = [];
    now = 1_000_000;
  });

  function makeRecorder(overrides = {}) {
    const track = createMockTrack();
    const stream = createMockStream(track);
    const getDisplayMedia = vi.fn(async () => stream);
    const recorder = new SessionRecorder({
      getDisplayMedia,
      MediaRecorderClass: createMockMediaRecorderClass(),
      downloadBlob: (blob, filename) => {
        downloads.push({ blob, filename, size: blob.size });
      },
      now: () => now,
      ...overrides,
    });
    return { recorder, track, stream, getDisplayMedia };
  }

  it('starts and stops with a local webm download', async () => {
    const { recorder } = makeRecorder();
    await recorder.start();
    expect(recorder.status).toBe(RECORDER_STATUS.recording);
    now += 3500;
    expect(recorder.getState().elapsedMs).toBe(3500);

    const result = await recorder.stop({ save: true });
    expect(result.saved).toBe(true);
    expect(result.filename).toMatch(/\.webm$/);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].size).toBeGreaterThan(0);
    expect(recorder.status).toBe(RECORDER_STATUS.idle);
    expect(recorder.getState().elapsedMs).toBe(0);
  });

  it('handles permission denial gracefully', async () => {
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    const deniedPicker = vi.fn(async () => { throw err; });
    const { recorder } = makeRecorder({ getDisplayMedia: deniedPicker });
    await recorder.start();
    expect(deniedPicker).toHaveBeenCalled();
    expect(recorder.status).toBe(RECORDER_STATUS.idle);
    expect(recorder.getState().error).toMatch(/cancelled or permission/i);
    expect(downloads).toHaveLength(0);
  });

  it('cancels without saving when dispose/stop(save:false)', async () => {
    const { recorder, track } = makeRecorder();
    await recorder.start();
    const result = await recorder.stop({ save: false });
    expect(result.saved).toBe(false);
    expect(downloads).toHaveLength(0);
    expect(track.stop).toHaveBeenCalled();
    expect(recorder.status).toBe(RECORDER_STATUS.idle);
  });

  it('stops and saves when the capture track ends', async () => {
    const { recorder, track } = makeRecorder();
    await recorder.start();
    track._emit('ended');
    // allow async stop from track-ended handler
    await vi.waitFor(() => {
      expect(recorder.status).toBe(RECORDER_STATUS.idle);
    });
    expect(downloads).toHaveLength(1);
  });

  it('releases resources after stop', async () => {
    const { recorder, track } = makeRecorder();
    await recorder.start();
    await recorder.stop({ save: true });
    expect(track.stop).toHaveBeenCalled();
    expect(recorder._stream).toBeNull();
    expect(recorder._recorder).toBeNull();
  });

  it('ignores late getDisplayMedia after cancel during requesting', async () => {
    let resolvePicker;
    const pending = new Promise((resolve) => { resolvePicker = resolve; });
    const track = createMockTrack();
    const stream = createMockStream(track);
    const { recorder } = makeRecorder({
      getDisplayMedia: vi.fn(() => pending),
    });

    const startPromise = recorder.start();
    expect(recorder.status).toBe(RECORDER_STATUS.requesting);
    await recorder.dispose();
    resolvePicker(stream);
    await startPromise;

    expect(recorder.status).toBe(RECORDER_STATUS.idle);
    expect(track.stop).toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });
});
