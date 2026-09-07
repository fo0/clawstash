import { useState, useCallback, useRef, useEffect } from 'react';
import { downloadCanvasPng } from '../utils/download';
import { COPY_TOAST_DURATION_MS } from '../utils/constants';

type ExportStatus = 'idle' | 'saved' | 'failed';

interface UsePngExportReturn {
  status: ExportStatus;
  /** Save the canvas as `filename`; flips `status` for the feedback window. */
  save: (canvas: HTMLCanvasElement | null, filename: string) => void;
}

/**
 * Button state for "save this canvas as a PNG", shared by the two graph views.
 *
 * Mirrors `useClipboard`: a short-lived status the button renders, reset by a
 * timer that is cleared on unmount so an export followed by navigating away
 * cannot set state on an unmounted component.
 */
export function usePngExport(feedbackDuration = COPY_TOAST_DURATION_MS): UsePngExportReturn {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const save = useCallback(
    (canvas: HTMLCanvasElement | null, filename: string) => {
      const started = canvas ? downloadCanvasPng(canvas, filename) : false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus(started ? 'saved' : 'failed');
      timeoutRef.current = setTimeout(() => setStatus('idle'), feedbackDuration);
    },
    [feedbackDuration],
  );

  return { status, save };
}
