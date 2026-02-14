import { useState, useCallback, useRef, useEffect } from 'react';
import { copyToClipboard } from '../../utils/clipboard';

/**
 * Hook for copy-to-clipboard with auto-dismissing toast notification.
 * Cleans up timer on unmount to prevent state updates on dead components.
 */
export function useCopyToast() {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async (value: string, label: string) => {
    const success = await copyToClipboard(value);
    setCopyNotice(success ? `"${label}" copied` : 'Copy failed');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopyNotice(null), 2000);
  }, []);

  return { copyNotice, handleCopy };
}

/**
 * Hook for toggling expandable spec preview sections.
 */
export function useExpandableSpecs() {
  const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set());

  const toggleSpecPreview = useCallback((id: string) => {
    setExpandedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { expandedSpecs, toggleSpecPreview };
}
