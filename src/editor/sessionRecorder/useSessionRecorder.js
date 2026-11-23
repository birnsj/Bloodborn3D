import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SessionRecorder,
  formatRecordingElapsed,
  isSessionRecorderSupported,
} from './SessionRecorder.js';

/**
 * React binding for SessionRecorder — elapsed tick + stable start/stop handlers.
 */
export function useSessionRecorder() {
  const recorderRef = useRef(null);
  if (!recorderRef.current) {
    recorderRef.current = new SessionRecorder({
      // Viewport fallback when the OS capture picker is unavailable (embedded browsers).
      getCanvas: () => document.querySelector('canvas'),
    });
  }

  const [snapshot, setSnapshot] = useState(() => recorderRef.current.getState());

  useEffect(() => {
    const recorder = recorderRef.current;
    const push = () => setSnapshot({ ...recorder.getState() });
    recorder._onStateChange = push;
    push();
    return () => {
      recorder._onStateChange = null;
      void recorder.dispose();
    };
  }, []);

  useEffect(() => {
    if (snapshot.status !== 'recording') return undefined;
    const recorder = recorderRef.current;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setSnapshot({ ...recorder.getState() });
      if (recorder.isRecording) {
        timerId = window.setTimeout(tick, 250);
      }
    };
    let timerId = window.setTimeout(tick, 250);
    return () => {
      alive = false;
      window.clearTimeout(timerId);
    };
  }, [snapshot.status]);

  const start = useCallback(async (options) => {
    const state = await recorderRef.current.start(options);
    setSnapshot({ ...state });
    return state;
  }, []);

  const stop = useCallback(async (opts) => {
    const result = await recorderRef.current.stop(opts);
    setSnapshot({ ...recorderRef.current.getState() });
    return result;
  }, []);

  return {
    status: snapshot.status,
    error: snapshot.error,
    elapsedMs: snapshot.elapsedMs,
    elapsedLabel: formatRecordingElapsed(snapshot.elapsedMs),
    isRecording: snapshot.status === 'recording',
    isBusy: snapshot.status === 'requesting' || snapshot.status === 'stopping',
    supported: snapshot.supported ?? isSessionRecorderSupported(),
    start,
    stop,
  };
}
