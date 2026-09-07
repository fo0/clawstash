import { useState, useEffect, useCallback, useRef } from 'react';
import type { Stash, TagInfo, FileInput } from '../../types';
import { api } from '../../api';
import { DELETE_CONFIRM_TIMEOUT_MS } from '../../utils/constants';
import { formatBytes, formatRelativeTime } from '../../utils/format';
import { clearDraft, loadDraft, saveDraft, type EditorDraft } from '../../utils/editor-draft';
import { MAX_IMPORT_FILES, readImportedFiles } from '../../utils/file-import';
import FileCodeEditor from './FileCodeEditor';
import TagCombobox from './TagCombobox';
import type { TagComboboxHandle } from './TagCombobox';
import MetadataEditor, { metadataToEntries, entriesToMetadata } from './MetadataEditor';
import type { MetadataEntry } from './MetadataEditor';

interface Props {
  stash: Stash | null;
  /**
   * Pre-fill a NEW stash from an existing one ("Duplicate"). Only read when
   * `stash` is null — the save branch keys on `stash`, so a template always
   * creates a new stash instead of overwriting the one it was copied from.
   */
  template?: Stash | null;
  onSave: (savedId?: string) => void;
  onCancel: () => void;
  /**
   * Notifies the parent whenever the unsaved-changes state flips, so in-app
   * navigation (sidebar clicks, hotkeys) can guard against silent data loss.
   * beforeunload only covers real page unloads, not SPA navigation.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Client-side mirrors of the server's payload limits
 * (`MAX_NAME_LENGTH` / `MAX_FILENAME_LENGTH` in `src/server/validation.ts`).
 * Duplicated as plain numbers on purpose: importing the server module into a
 * client component would pull Zod into the browser bundle for two integers.
 * The server stays the enforcing boundary — these only stop the user from
 * typing past a limit they could not see.
 */
const MAX_NAME_LENGTH = 500;
const MAX_FILENAME_LENGTH = 255;
/**
 * Mirror of `MAX_FILE_CONTENT_LENGTH`. The server caps `content` via Zod
 * `.max()`, which counts string length, so the pre-submit check compares
 * `content.length` — not a byte count — and stays exactly as strict.
 */
const MAX_FILE_CONTENT_LENGTH = 10 * 1024 * 1024;

/**
 * Soft-wrap preference for the file editors. Kept separate from the viewer's
 * `clawstash-wrap-lines` key: reading a stash and editing it are different
 * contexts, and silently flipping one because the other was toggled would be
 * surprising.
 */
const EDITOR_WRAP_PREF_KEY = 'clawstash-editor-wrap-lines';

/**
 * How long the editor waits after the last keystroke before mirroring its form
 * state into the recovery draft. Long enough that typing never serializes the
 * whole stash on every character, short enough that a crash loses at most a
 * second of work.
 */
const DRAFT_AUTOSAVE_DEBOUNCE_MS = 1000;

/** Read the persisted editor wrap preference. Defaults to off (horizontal scroll). */
function getEditorWrapPreference(): boolean {
  try {
    return localStorage.getItem(EDITOR_WRAP_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

function setEditorWrapPreference(enabled: boolean): void {
  try {
    localStorage.setItem(EDITOR_WRAP_PREF_KEY, String(enabled));
  } catch {
    /* Storage disabled / full — the preference stays in memory for this session. */
  }
}

/**
 * One-line summary of a file whose editor is folded away: size and line count,
 * or just "empty" — "empty · 1 line" would be a contradiction. Size is measured
 * in string length, the same measure the save-time oversize check uses.
 */
function describeFileContent(content: string): string {
  if (!content) return 'empty';
  const lines = content.split('\n').length;
  return `${formatBytes(content.length)} · ${lines} line${lines !== 1 ? 's' : ''}`;
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="info-icon" title={tooltip}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.516-.552.974-.552.97 0 1.447.67 1.447 1.181 0 .43-.245.756-.462.97l-.044.042c-.21.196-.383.375-.383.632v.22a.75.75 0 0 1-1.5 0v-.22c0-.67.406-1.05.634-1.26l.044-.043c.16-.147.228-.228.228-.356 0-.098-.06-.233-.447-.233-.218 0-.316.1-.361.183ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
    </span>
  );
}

export default function StashEditor({ stash, template, onSave, onCancel, onDirtyChange }: Props) {
  // The stash the form is seeded from: the edited stash, or — when creating —
  // the optional duplicate template. Everything below reads `source` for its
  // INITIAL value only; `stash` alone still decides create vs. update.
  const source = stash ?? template ?? null;
  const [name, setName] = useState(source?.name || '');
  const [description, setDescription] = useState(source?.description || '');
  const [tags, setTags] = useState<string[]>(source?.tags || []);
  const [metadataEntries, setMetadataEntries] = useState<MetadataEntry[]>(
    source && Object.keys(source.metadata).length > 0 ? metadataToEntries(source.metadata) : [],
  );
  const [files, setFiles] = useState<FileInput[]>(
    source
      ? source.files.map((f) => ({
          filename: f.filename,
          content: f.content,
          language: f.language,
        }))
      : [{ filename: '', content: '', language: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Index of the file whose Remove button is armed (two-click confirm),
  // or null. Removing a file destroys its typed content, so it gets the
  // same two-step confirm as every other destructive action in the app.
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);
  // Soft-wrap long lines in the file editors (persisted, applies to all files
  // of the stash — same scope as the viewer's wrap toggle).
  const [wrapLines, setWrapLines] = useState<boolean>(getEditorWrapPreference);
  // Ids (see `fileIds` below) of the files whose editor is folded away. A
  // stash may hold up to 100 files and every one of them renders a full code
  // editor, so editing file 9 of 12 meant scrolling past eight open editors —
  // the viewer has offered per-file collapse all along. Not persisted: it is a
  // per-session working state, like the viewer's.
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());
  // File import (picker + drag & drop): in-flight flag, drag highlight, and
  // the per-file reasons for anything the import refused.
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importSkipped, setImportSkipped] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);
  const [availableMetaKeys, setAvailableMetaKeys] = useState<string[]>([]);
  // A duplicate arrives with real filenames too, so the name→filename
  // auto-fill must stay off for it as well.
  const [firstFileManuallyEdited, setFirstFileManuallyEdited] = useState(!!source);
  // Keep a ref to handleSave so the Ctrl/Cmd+S listener always calls the
  // latest version without being recreated on every render.
  const handleSaveRef = useRef<() => void>(() => {});
  // Track whether the user has made any edits since the editor opened.
  // Used by the beforeunload handler to warn about unsaved changes.
  const dirtyRef = useRef(false);
  // Re-entry guard for handleSave: the Ctrl/Cmd+S listener bypasses the
  // disabled Save button, so two quick presses would otherwise fire two
  // createStash calls and produce a duplicate stash.
  const savingRef = useRef(false);
  // Latest onDirtyChange for the unmount cleanup (avoids a stale closure).
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  // Imperative handle for committing a half-typed tag before saving —
  // Ctrl/Cmd+S doesn't blur the tag input, so without this the pending
  // text would be silently lost.
  const tagComboboxRef = useRef<TagComboboxHandle>(null);

  // Recovery draft for this editor target (`null` id = the new-stash form).
  // Read once on mount: a draft only exists when a previous session ended
  // without running any cleanup — a tab crash, a killed background tab, or a
  // dismissed unload prompt. Held in state so Restore/Discard can retire the
  // banner. See utils/editor-draft.ts for the lifecycle.
  const draftTargetId = stash?.id ?? null;
  // Version the draft is written against, so a restore can warn when the stash
  // has moved on in the meantime. Hoisted out of the effect's dependency array,
  // which may only hold plain identifiers.
  const draftBaseVersion = stash?.version;
  const [recoveredDraft, setRecoveredDraft] = useState<EditorDraft | null>(() =>
    loadDraft(stash?.id ?? null),
  );

  // Reads the callback through a ref so stable useCallbacks (updateFile,
  // handleNameChange) never capture a stale onDirtyChange prop.
  const markDirty = () => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      onDirtyChangeRef.current?.(true);
    }
  };

  // On unmount the editor's unsaved state is gone either way — reset the
  // parent's dirty flag so a later navigation isn't blocked by a stale guard,
  // and drop the recovery draft: every unmount path is a deliberate exit the
  // user already confirmed (Cancel, Escape, a guarded navigation, a save), so
  // resurrecting the content on the next open would contradict that choice.
  // A crash or a closed tab runs no cleanup, which is exactly when the draft
  // must survive. Guarded on `dirtyRef` so React's development-mode double
  // mount — which unmounts before anything was typed — cannot wipe a draft the
  // banner is about to offer.
  useEffect(() => {
    return () => {
      onDirtyChangeRef.current?.(false);
      if (dirtyRef.current) clearDraft(draftTargetId);
    };
  }, [draftTargetId]);

  /**
   * Mirror the form state into the recovery draft, debounced, while the editor
   * is dirty. `dirtyRef` is deliberately read rather than depended on: it only
   * ever flips inside the same interactions that change the state below, so by
   * the time this effect runs after a real edit it is already true — and the
   * mount pass, which has nothing worth saving, is skipped.
   */
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => {
      saveDraft(draftTargetId, {
        savedAt: Date.now(),
        baseVersion: draftBaseVersion,
        name,
        description,
        tags,
        metadata: metadataEntries.map((e) => ({ key: e.key, value: e.value })),
        files: files.map((f) => ({
          filename: f.filename,
          content: f.content,
          language: f.language,
        })),
      });
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name, description, tags, metadataEntries, files, draftTargetId, draftBaseVersion]);

  // useRef(initialValue) re-evaluates `initialValue` on every render but only
  // keeps the FIRST render's result. The naive `.map(() => counter++)` form
  // therefore increments the counter on every re-render, leaking IDs and
  // letting React reuse keys for new file slots. Use an initialised flag so
  // the seeding runs exactly once.
  const fileIdCounter = useRef(0);
  const fileIds = useRef<number[]>([]);
  const fileIdsInitialized = useRef(false);
  if (!fileIdsInitialized.current) {
    fileIdsInitialized.current = true;
    const initialFiles = source ? source.files : [{ filename: '', content: '', language: '' }];
    fileIds.current = initialFiles.map(() => fileIdCounter.current++);
  }

  /** Load the recovered draft into the form and retire the banner. */
  const restoreDraft = () => {
    if (!recoveredDraft) return;
    setName(recoveredDraft.name);
    setDescription(recoveredDraft.description);
    setTags(recoveredDraft.tags);
    setMetadataEntries(recoveredDraft.metadata.map((e) => ({ key: e.key, value: e.value })));
    // An empty file list would leave the form with no editor at all — fall
    // back to the same blank row a fresh new-stash form starts with.
    const restoredFiles: FileInput[] =
      recoveredDraft.files.length > 0
        ? recoveredDraft.files.map((f) => ({ ...f }))
        : [{ filename: '', content: '', language: '' }];
    setFiles(restoredFiles);
    // Fresh ids so every file editor remounts with the restored content
    // instead of reusing the row that happened to sit at the same index.
    fileIds.current = restoredFiles.map(() => fileIdCounter.current++);
    // The old ids are gone with the old rows — start the restored files unfolded.
    setCollapsedFiles(new Set());
    // The restored content differs from what the server holds, and the first
    // filename came from the draft — keep the name auto-fill off.
    setFirstFileManuallyEdited(true);
    markDirty();
    setRecoveredDraft(null);
  };

  /** Drop the recovered draft without applying it. */
  const discardDraft = () => {
    clearDraft(draftTargetId);
    setRecoveredDraft(null);
  };

  // Load available tags and metadata keys
  useEffect(() => {
    let cancelled = false;
    api
      .getTags()
      .then((t) => {
        if (!cancelled) setAvailableTags(t);
      })
      .catch(() => {});
    api
      .getMetadataKeys()
      .then((k) => {
        if (!cancelled) setAvailableMetaKeys(k);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-name first file from stash name (only when creating new, and first
  // file name wasn't manually edited). Use functional setFiles so a fast
  // typer cannot race an in-flight updateFile() and overwrite freshly-edited
  // file content with a stale closure-captured snapshot. Removing `files`
  // from the dep list also avoids recreating the callback on every keystroke.
  const handleNameChange = useCallback(
    (newName: string) => {
      markDirty();
      setName(newName);
      if (firstFileManuallyEdited) return;
      setFiles((prev) => {
        if (prev.length === 0) return prev;
        const ext = prev[0].filename ? prev[0].filename.match(/\.[^.]+$/)?.[0] : '';
        const baseFileName = newName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        if (!baseFileName) return prev;
        const updated = [...prev];
        updated[0] = { ...updated[0], filename: baseFileName + (ext || '') };
        return updated;
      });
    },
    [firstFileManuallyEdited],
  );

  /** Toggle soft-wrapping in the file editors and persist the choice. */
  const toggleWrapLines = () => {
    setWrapLines((prev) => {
      const next = !prev;
      setEditorWrapPreference(next);
      return next;
    });
  };

  /**
   * Fold a single file's editor away (or unfold it). Only the code editor is
   * hidden — the filename and language inputs stay editable in the header, and
   * the content itself lives in `files` state, so folding never touches it.
   */
  const toggleFileCollapsed = useCallback((fileId: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // True when every file on screen is folded. Checked against the live id list
  // rather than by comparing sizes, so an id left over from a removed row can
  // never make the master toggle claim the wrong state.
  const allFilesCollapsed =
    files.length > 0 && fileIds.current.every((id) => collapsedFiles.has(id));

  /** Fold every file away, or — when all of them already are — unfold them all. */
  const toggleAllFilesCollapsed = () => {
    setCollapsedFiles(allFilesCollapsed ? new Set() : new Set(fileIds.current));
  };

  /**
   * Add picked or dropped files as file rows. Getting an existing file into a
   * stash previously meant opening it elsewhere, copying its content and
   * pasting it into an empty row — one round trip per file.
   *
   * A single untouched blank row is replaced rather than kept above the
   * import: it is the form's starting state, not something the user typed.
   */
  const importFiles = async (selected: File[]) => {
    if (selected.length === 0 || importing) return;
    setImporting(true);
    try {
      const { files: imported, skipped } = await readImportedFiles(
        selected,
        MAX_FILE_CONTENT_LENGTH,
      );
      if (imported.length > 0) {
        markDirty();
        const blankStart =
          files.length === 1 && !files[0].filename.trim() && !files[0].content.trim();
        const baseFiles = blankStart ? [] : files;
        const baseIds = blankStart ? [] : fileIds.current;
        fileIds.current = [...baseIds, ...imported.map(() => fileIdCounter.current++)];
        setFiles([...baseFiles, ...imported]);
        // The imported filename is the user's choice of name — stop the stash
        // name from overwriting row 1 the next time the name field changes.
        setFirstFileManuallyEdited(true);
      }
      setImportSkipped(skipped);
    } finally {
      setImporting(false);
    }
  };

  /**
   * Drag events fire for every element entered inside the drop zone, so a
   * plain enter/leave pair flickers the highlight. Count depth instead.
   */
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth.current++;
    setDragActive(true);
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    // Without this the browser navigates to the dropped file, abandoning the
    // form (the beforeunload guard would only warn).
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    void importFiles(Array.from(e.dataTransfer.files));
  };

  const addFile = () => {
    markDirty();
    const newId = fileIdCounter.current++;
    setFiles([...files, { filename: '', content: '', language: '' }]);
    fileIds.current.push(newId);
    // Move focus into the new file's filename input. Besides being the
    // natural next step, this also keeps focus off the Add File button —
    // where global single-key hotkeys would otherwise be live.
    requestAnimationFrame(() => {
      const input = document.getElementById(`stash-file-name-${newId}`);
      if (input instanceof HTMLInputElement) input.focus();
    });
  };

  /**
   * Remove a file row. Rows with typed content require a second click on the
   * armed button (two-step confirm); empty rows are removed immediately.
   */
  const removeFile = (index: number) => {
    if (files.length === 1) return;
    const hasContent = !!files[index] && files[index].content.trim().length > 0;
    if (hasContent && confirmRemoveIndex !== index) {
      setConfirmRemoveIndex(index);
      return;
    }
    markDirty();
    setConfirmRemoveIndex(null);
    setFiles(files.filter((_, i) => i !== index));
    const [removedId] = fileIds.current.splice(index, 1);
    // Drop the removed row's collapse flag — a stale id would otherwise sit in
    // the set forever and could be handed back to a later file if ids ever wrap.
    setCollapsedFiles((prev) => {
      if (!prev.has(removedId)) return prev;
      const next = new Set(prev);
      next.delete(removedId);
      return next;
    });
  };

  const updateFile = useCallback((index: number, field: keyof FileInput, value: string) => {
    markDirty();
    setFiles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    if (index === 0 && field === 'filename') {
      setFirstFileManuallyEdited(true);
    }
  }, []);

  const handleSave = async () => {
    // The Ctrl/Cmd+S listener bypasses the disabled button — bail while a
    // save is already in flight instead of firing a duplicate request.
    if (savingRef.current) return;

    // Commit a half-typed tag before validating/saving. The commit's
    // onChange -> setTags is batched by React and NOT yet visible in this
    // closure's `tags`, so commitPending() also RETURNS the added tags and
    // we append them to the payload ourselves. The state update still runs,
    // keeping the UI in sync (chip appears, e.g. if validation fails below).
    const pendingTags = tagComboboxRef.current?.commitPending() ?? [];
    const allTags = pendingTags.length > 0 ? [...tags, ...pendingTags] : tags;

    // A file with content but no filename would be silently dropped by the
    // filter below — and its content lost when the editor unmounts. Block
    // the save instead.
    const missingNameIndex = files.findIndex((f) => f.content.trim() && !f.filename.trim());
    if (missingNameIndex !== -1) {
      setError(`File ${missingNameIndex + 1} has content but no filename.`);
      return;
    }
    const validFiles = files.filter((f) => f.filename.trim());
    if (validFiles.length === 0) {
      setError('At least one file with a filename is required.');
      return;
    }
    // Duplicate filenames: the raw-file route looks files up by exact name,
    // so the second file would be stored but unreachable. Block the save.
    const seenFilenames = new Set<string>();
    for (const f of validFiles) {
      const trimmedName = f.filename.trim();
      if (seenFilenames.has(trimmedName)) {
        setError(`Duplicate filename "${trimmedName}" — filenames must be unique within a stash.`);
        return;
      }
      seenFilenames.add(trimmedName);
    }
    // Oversize content: without this a multi-MB payload is uploaded only to
    // come back as a raw Zod path string. Name the file and its size instead.
    const oversized = validFiles.find((f) => f.content.length > MAX_FILE_CONTENT_LENGTH);
    if (oversized) {
      setError(
        `File "${oversized.filename.trim()}" is ${formatBytes(oversized.content.length)} — over the ` +
          `${formatBytes(MAX_FILE_CONTENT_LENGTH)} per-file limit. Split it into several files.`,
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');

    try {
      const metadata = entriesToMetadata(metadataEntries);

      const payload = {
        name,
        description,
        tags: allTags,
        metadata,
        files: validFiles.map((f) => ({
          // Trim: filenames are validated trimmed above; sending them raw
          // would store invisible whitespace and break exact-match raw
          // file lookups.
          filename: f.filename.trim(),
          content: f.content,
          language: f.language || undefined,
        })),
      };

      if (stash) {
        await api.updateStash(stash.id, payload);
        dirtyRef.current = false;
        onDirtyChangeRef.current?.(false);
        // The work is on the server now — a leftover draft would offer it back
        // as "unsaved" the next time this stash is edited.
        clearDraft(draftTargetId);
        onSave(stash.id);
      } else {
        const created = await api.createStash(payload);
        dirtyRef.current = false;
        onDirtyChangeRef.current?.(false);
        clearDraft(draftTargetId);
        onSave(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stash');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Keep ref in sync so the keyboard listener below always invokes the
  // latest handleSave closure (which closes over fresh `files`, `name`, etc.)
  // without needing to re-register the listener on every render.
  handleSaveRef.current = () => {
    void handleSave();
  };

  // Ctrl+S / Cmd+S — save the stash from anywhere inside the editor.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // toLowerCase: with Caps Lock on, e.key is 'S' and the browser's own
      // Save dialog would open instead.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-disarm the two-step file-remove confirm after a short timeout —
  // mirrors the stash-delete confirm in the viewer.
  useEffect(() => {
    if (confirmRemoveIndex === null) return;
    const timer = setTimeout(() => setConfirmRemoveIndex(null), DELETE_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirmRemoveIndex]);

  // Warn before navigating away (browser back, tab close) with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        // preventDefault() alone is enough for spec-compliant browsers, but
        // several (older Chrome/Safari, some mobile engines) only raise the
        // native "unsaved changes" prompt when the legacy returnValue is also
        // set. Setting both makes the data-loss guard fire reliably everywhere.
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <div className="stash-editor">
      {/*
        App.tsx renders no app-level heading, so the visible <h2> below was
        the highest heading on this view — the same missing-<h1> gap already
        closed in StashViewer and Settings. A visually-hidden <h1> restores
        h1 -> h2 -> h3 without touching the visible heading or its
        tag-selector CSS.
      */}
      <h1 className="sr-only">
        {stash ? 'Edit Stash' : template ? 'Duplicate Stash' : 'New Stash'}
      </h1>
      <div className="editor-header">
        <h2>{stash ? 'Edit Stash' : template ? 'Duplicate Stash' : 'New Stash'}</h2>
        <div className="editor-header-actions">
          {confirmCancel ? (
            <span className="cancel-confirm-inline">
              Discard changes?
              <button
                className="btn btn-danger btn-sm"
                onClick={onCancel}
                title="Discard all unsaved changes"
              >
                Discard
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmCancel(false)}
                title="Keep editing"
              >
                Keep editing
              </button>
            </span>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (dirtyRef.current) {
                  setConfirmCancel(true);
                } else {
                  onCancel();
                }
              }}
              title="Discard changes and go back"
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
              Cancel
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            title="Save this stash (Ctrl+S / Cmd+S)"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
            </svg>
            {saving ? 'Saving...' : 'Save Stash'}
          </button>
        </div>
      </div>

      {recoveredDraft && (
        <div className="draft-recovery-banner" role="status">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7 7 0 0 1 15 8a.75.75 0 0 1-1.5 0 5.5 5.5 0 0 0-5.5-5.5Zm-6.203 5.5a.75.75 0 0 1 .75.75A5.5 5.5 0 0 0 12.131 11.63l-1.204-1.204A.25.25 0 0 1 11.104 10h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7 7 0 0 1 1.047 8.75a.75.75 0 0 1 .75-.75Z" />
          </svg>
          <span className="draft-recovery-text">
            Unsaved changes from{' '}
            {formatRelativeTime(new Date(recoveredDraft.savedAt).toISOString())} were recovered —
            the editor was closed before they could be saved.
            {stash &&
              recoveredDraft.baseVersion !== undefined &&
              recoveredDraft.baseVersion !== stash.version &&
              ` They were written against v${recoveredDraft.baseVersion}; this stash is now at v${stash.version}.`}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={restoreDraft}
            title="Load the recovered changes into this form"
          >
            Restore
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={discardDraft}
            title="Delete the recovered changes and keep the saved content"
          >
            Discard
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="editor-form">
        <div className="form-group">
          <label htmlFor="stash-name">
            Name
            <InfoIcon tooltip="A short, descriptive name for this stash. Displayed in the sidebar and dashboard. If left empty, the first filename is used." />
          </label>
          <input
            id="stash-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Docker Compose Setup, API Keys, Prompt Template..."
            className="form-input"
            // Mirrors MAX_NAME_LENGTH in server/validation.ts. Without it the
            // limit was only discoverable by hitting a raw Zod error on save.
            maxLength={MAX_NAME_LENGTH}
            // Only on a brand-new stash, where the name is the first thing the
            // user came to type. Editing an existing stash does not move focus.
            // eslint-disable-next-line jsx-a11y/no-autofocus -- new-stash form only
            autoFocus={!stash}
          />
        </div>

        <div className="form-group">
          <label htmlFor="stash-description">
            Description
            <InfoIcon tooltip="A longer description that helps identify the stash content and purpose. Useful for AI agents to understand what this stash contains without reading all files." />
            <span className="label-hint"> - helps AI identify the stash</span>
          </label>
          <textarea
            id="stash-description"
            value={description}
            onChange={(e) => {
              markDirty();
              setDescription(e.target.value);
            }}
            placeholder="Describe what this stash contains and what it's used for..."
            className="form-textarea description-textarea"
            rows={2}
          />
          {description.length > 0 && (
            <span
              className={`description-char-count${description.length > 45000 ? ' description-char-count-warn' : ''}`}
              aria-live="polite"
              aria-label={`${description.length} of 50000 characters`}
            >
              {description.length.toLocaleString()} / 50,000
            </span>
          )}
        </div>

        <div className="form-group">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control --
              TagCombobox is a composite (input + listbox + tag chips), so no
              single `htmlFor` can own it. It consumes this id through
              `inputLabelledBy` instead; the rule cannot see across the
              component boundary. */}
          <label id="stash-tags-label">
            Tags
            <InfoIcon tooltip="Tags to categorize your stash. Type to search existing tags or create new ones. Press Enter or comma to add. Tags let you filter and find stashes quickly." />
          </label>
          <TagCombobox
            ref={tagComboboxRef}
            tags={tags}
            onChange={(t) => {
              markDirty();
              setTags(t);
            }}
            availableTags={availableTags}
            inputLabelledBy="stash-tags-label"
          />
        </div>

        <div className="form-group">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control --
              same as Tags above: MetadataEditor is a composite and takes this
              id via `labelledBy` on its `role="group"` wrapper. */}
          <label id="stash-metadata-label">
            Metadata
            <InfoIcon tooltip="Key-value pairs for storing structured data like model name, agent ID, or purpose. Searchable via API/MCP. Choose from existing keys or create new ones." />
            <span className="label-hint"> - optional</span>
          </label>
          <MetadataEditor
            entries={metadataEntries}
            onChange={(e) => {
              markDirty();
              setMetadataEntries(e);
            }}
            availableKeys={availableMetaKeys}
            labelledBy="stash-metadata-label"
          />
        </div>

        <div
          className={`editor-files${dragActive ? ' editor-files-dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault();
          }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="files-header">
            <h3>
              Files
              <InfoIcon tooltip="Each stash can contain one or more files. Files are the actual content you want to store — code snippets, configs, prompts, or any text. The language is auto-detected from the file extension." />
            </h3>
            <div className="files-header-actions">
              {files.length > 1 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost editor-files-collapse-all"
                  onClick={toggleAllFilesCollapsed}
                  aria-expanded={!allFilesCollapsed}
                  title={allFilesCollapsed ? 'Expand all files' : 'Collapse all files'}
                  aria-label={allFilesCollapsed ? 'Expand all files' : 'Collapse all files'}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className={`file-collapse-chevron ${allFilesCollapsed ? '' : 'expanded'}`}
                    aria-hidden="true"
                  >
                    <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                  {allFilesCollapsed ? 'Expand all' : 'Collapse all'}
                </button>
              )}
              <button
                className={`btn btn-sm btn-ghost wrap-toggle ${wrapLines ? 'wrap-active' : ''}`}
                onClick={toggleWrapLines}
                aria-pressed={wrapLines}
                title={
                  wrapLines
                    ? 'Stop wrapping — scroll long lines horizontally'
                    : 'Wrap long lines to fit the editor width'
                }
                aria-label={wrapLines ? 'Stop wrapping long lines' : 'Wrap long lines'}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M1.75 3.5a.75.75 0 0 1 0-1.5h12.5a.75.75 0 0 1 0 1.5H1.75Zm0 5a.75.75 0 0 1 0-1.5h9.5a2.75 2.75 0 0 1 0 5.5H8.56l.72.72a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 0 1 1.06 1.06l-.72.72h2.69a1.25 1.25 0 0 0 0-2.5h-9.5Zm0 5a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 0 1.5h-3.5Z" />
                </svg>
                Wrap
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  // Reset first: picking the same file twice in a row fires no
                  // change event otherwise.
                  e.target.value = '';
                  void importFiles(picked);
                }}
              />
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                aria-busy={importing || undefined}
                title={`Read files from disk into this stash (or drop them here, up to ${MAX_IMPORT_FILES} at a time)`}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8.75 1.75a.75.75 0 0 0-1.5 0v6.44L5.28 6.22a.75.75 0 1 0-1.06 1.06l3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 0 0-1.06-1.06L8.75 8.19Zm-6 8.5a.75.75 0 0 0-1.5 0v2A2.75 2.75 0 0 0 4 15h8a2.75 2.75 0 0 0 2.75-2.75v-2a.75.75 0 0 0-1.5 0v2c0 .69-.56 1.25-1.25 1.25H4c-.69 0-1.25-.56-1.25-1.25Z" />
                </svg>
                {importing ? 'Importing…' : 'Import Files'}
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={addFile}
                title="Add another file to this stash"
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
                </svg>
                Add File
              </button>
            </div>
          </div>

          {dragActive && (
            <div className="editor-files-drop-hint" aria-hidden="true">
              Drop to add {MAX_IMPORT_FILES} files at most as new file rows
            </div>
          )}

          {/* Silently dropping a picked file would look like the import simply
              did nothing — name every file that did not make it, and why. */}
          {importSkipped.length > 0 && (
            <div className="editor-import-skipped" role="status" aria-live="polite">
              <div className="editor-import-skipped-head">
                <span>
                  {importSkipped.length} file{importSkipped.length !== 1 ? 's' : ''} not imported
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setImportSkipped([])}
                  aria-label="Dismiss import warnings"
                >
                  Dismiss
                </button>
              </div>
              <ul>
                {importSkipped.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {files.map((file, index) => {
            const fileId = fileIds.current[index];
            const collapsed = collapsedFiles.has(fileId);
            const fileLabel = file.filename.trim() || `file ${index + 1}`;
            return (
              <div
                key={fileId}
                className={`editor-file${collapsed ? ' editor-file-collapsed' : ''}`}
              >
                <div className="editor-file-header">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost file-collapse-toggle"
                    onClick={() => toggleFileCollapsed(fileId)}
                    aria-expanded={!collapsed}
                    aria-controls={`stash-file-editor-${fileId}`}
                    title={collapsed ? `Expand ${fileLabel}` : `Collapse ${fileLabel}`}
                    aria-label={collapsed ? `Expand ${fileLabel}` : `Collapse ${fileLabel}`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className={`file-collapse-chevron ${collapsed ? '' : 'expanded'}`}
                      aria-hidden="true"
                    >
                      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </button>
                  <input
                    id={`stash-file-name-${fileIds.current[index]}`}
                    type="text"
                    value={file.filename}
                    onChange={(e) => updateFile(index, 'filename', e.target.value)}
                    placeholder="filename.ext"
                    className="form-input file-name-input"
                    // Mirrors MAX_FILENAME_LENGTH in server/validation.ts.
                    maxLength={MAX_FILENAME_LENGTH}
                    aria-label={`File ${index + 1} filename`}
                    title="Filename with extension (e.g. config.yml, main.py). The language is auto-detected from the extension."
                  />
                  <input
                    type="text"
                    value={file.language}
                    onChange={(e) => updateFile(index, 'language', e.target.value)}
                    placeholder="language (auto)"
                    className="form-input file-lang-input"
                    aria-label={`File ${index + 1} language`}
                    title="Programming language. Leave blank to auto-detect from the file extension."
                  />
                  {files.length > 1 &&
                    (confirmRemoveIndex === index ? (
                      <button
                        className="btn btn-sm btn-danger btn-remove"
                        onClick={() => removeFile(index)}
                        title="This file has content — click again to remove it"
                        aria-label="Confirm removing this file and its content"
                      >
                        Remove?
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-ghost btn-remove"
                        onClick={() => removeFile(index)}
                        title="Remove this file"
                        aria-label="Remove this file"
                      >
                        <svg
                          aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
                        </svg>
                      </button>
                    ))}
                </div>
                {collapsed ? (
                  // Folded: name what is hidden, so a wall of headers still says
                  // which file is the big one. Length, not bytes on the wire —
                  // the same measure the save-time size check uses.
                  <button
                    type="button"
                    id={`stash-file-editor-${fileId}`}
                    className="editor-file-collapsed-summary"
                    onClick={() => toggleFileCollapsed(fileId)}
                    title={`Expand ${fileLabel}`}
                    aria-label={`Expand ${fileLabel}`}
                  >
                    {describeFileContent(file.content)}
                  </button>
                ) : (
                  <div className="code-editor-wrapper" id={`stash-file-editor-${fileId}`}>
                    <FileCodeEditor
                      file={file}
                      index={index}
                      updateFile={updateFile}
                      wrap={wrapLines}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
