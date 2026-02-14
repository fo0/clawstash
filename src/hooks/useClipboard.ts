import { useState, useCallback, useRef, useEffect } from 'react';
import { copyToClipboard } from '../utils/clipboard';

interface UseClipboardOptions {
  feedbackDuration?: number;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

/** Internal base hook: manages copy + timed status reset + cleanup. */
function useClipboardBase<T>(
  idleValue: T,
  feedbackDuration: number,
) {
  const [state, setState] = useState(idleValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const trigger = useCallback(async (text: string, successValue: T, failValue: T): Promise<boolean> => {
    const success = await copyToClipboard(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState(success ? successValue : failValue);
    timeoutRef.current = setTimeout(() => setState(idleValue), feedbackDuration);
    return success;
  }, [idleValue, feedbackDuration]);

  return { state, trigger };
}

interface UseClipboardReturn {
  status: CopyStatus;
  copied: boolean;
  copy: (text: string) => Promise<void>;
}

/**
 * Hook for a single copy-to-clipboard button with visual feedback.
 * Shows 'copied' or 'failed' status for 2s, then resets to 'idle'.
 * Handles timeout cleanup on unmount and rapid clicks.
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const { feedbackDuration = 2000 } = options;
  const { state, trigger } = useClipboardBase<CopyStatus>('idle', feedbackDuration);

  const copy = useCallback(async (text: string) => {
    await trigger(text, 'copied', 'failed');
  }, [trigger]);

  return { status: state, copied: state === 'copied', copy };
}

interface UseClipboardWithKeyReturn {
  copiedKey: string | null;
  failedKey: string | null;
  copy: (key: string, text: string) => Promise<void>;
  isCopied: (key: string) => boolean;
  isFailed: (key: string) => boolean;
}

/**
 * Hook for multiple copy-to-clipboard buttons (e.g. in a list).
 * Tracks which specific button was clicked via a key.
 * Handles timeout cleanup on unmount and rapid clicks.
 */
export function useClipboardWithKey(options: UseClipboardOptions = {}): UseClipboardWithKeyReturn {
  const { feedbackDuration = 2000 } = options;
  const { state, trigger } = useClipboardBase<{ key: string; ok: boolean } | null>(null, feedbackDuration);

  const copy = useCallback(async (key: string, text: string) => {
    await trigger(text, { key, ok: true }, { key, ok: false });
  }, [trigger]);

  const isCopied = (key: string) => state?.key === key && state.ok === true;
  const isFailed = (key: string) => state?.key === key && state.ok === false;

  return {
    copiedKey: state?.ok ? state.key : null,
    failedKey: state && !state.ok ? state.key : null,
    copy,
    isCopied,
    isFailed,
  };
}
