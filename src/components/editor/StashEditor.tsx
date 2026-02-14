import { useState, useEffect, useCallback, useRef } from 'react';
import type { Stash, TagInfo, FileInput } from '../../types';
import { api } from '../../api';
import FileCodeEditor from './FileCodeEditor';
import TagCombobox from './TagCombobox';
import MetadataEditor, { metadataToEntries, entriesToMetadata } from './MetadataEditor';
import type { MetadataEntry } from './MetadataEditor';

interface Props {
  stash: Stash | null;
  onSave: (savedId?: string) => void;
  onCancel: () => void;
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <span className="info-icon" title={tooltip}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.516-.552.974-.552.97 0 1.447.67 1.447 1.181 0 .43-.245.756-.462.97l-.044.042c-.21.196-.383.375-.383.632v.22a.75.75 0 0 1-1.5 0v-.22c0-.67.406-1.05.634-1.26l.044-.043c.16-.147.228-.228.228-.356 0-.098-.06-.233-.447-.233-.218 0-.316.1-.361.183ZM8 10.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
    </span>
  );
}

export default function StashEditor({ stash, onSave, onCancel }: Props) {
  const [name, setName] = useState(stash?.name || '');
  const [description, setDescription] = useState(stash?.description || '');
  const [tags, setTags] = useState<string[]>(stash?.tags || []);
  const [metadataEntries, setMetadataEntries] = useState<MetadataEntry[]>(
    stash && Object.keys(stash.metadata).length > 0 ? metadataToEntries(stash.metadata) : []
  );
  const [files, setFiles] = useState<FileInput[]>(
    stash
      ? stash.files.map((f) => ({ filename: f.filename, content: f.content, language: f.language }))
      : [{ filename: '', content: '', language: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);
  const [availableMetaKeys, setAvailableMetaKeys] = useState<string[]>([]);
  const [firstFileManuallyEdited, setFirstFileManuallyEdited] = useState(!!stash);

  const fileIdCounter = useRef(0);
  const [fileIds] = useState<number[]>(() =>
    (stash ? stash.files : [{ filename: '', content: '', language: '' }]).map(() => fileIdCounter.current++)
  );

  // Load available tags and metadata keys
  useEffect(() => {
    let cancelled = false;
    api.getTags().then((t) => { if (!cancelled) setAvailableTags(t); }).catch(() => {});
    api.getMetadataKeys().then((k) => { if (!cancelled) setAvailableMetaKeys(k); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Auto-name first file from stash name (only when creating new, and first file name wasn't manually edited)
  const handleNameChange = useCallback((newName: string) => {
    setName(newName);
    if (!firstFileManuallyEdited && files.length > 0) {
      const ext = files[0].filename ? files[0].filename.match(/\.[^.]+$/)?.[0] : '';
      const baseFileName = newName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (baseFileName) {
        const updated = [...files];
        updated[0] = { ...updated[0], filename: baseFileName + (ext || '') };
        setFiles(updated);
      }
    }
  }, [firstFileManuallyEdited, files]);

  const addFile = () => {
    setFiles([...files, { filename: '', content: '', language: '' }]);
    fileIds.push(fileIdCounter.current++);
  };

  const removeFile = (index: number) => {
    if (files.length === 1) return;
    setFiles(files.filter((_, i) => i !== index));
    fileIds.splice(index, 1);
  };

  const updateFile = useCallback((index: number, field: keyof FileInput, value: string) => {
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
    const validFiles = files.filter((f) => f.filename.trim());
    if (validFiles.length === 0) {
      setError('At least one file with a filename is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const metadata = entriesToMetadata(metadataEntries);

      const payload = {
        name,
        description,
        tags,
        metadata,
        files: validFiles.map((f) => ({
          filename: f.filename,
          content: f.content,
          language: f.language || undefined,
        })),
      };

      if (stash) {
        await api.updateStash(stash.id, payload);
        onSave(stash.id);
      } else {
        const created = await api.createStash(payload);
        onSave(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stash');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stash-editor">
      <div className="editor-header">
        <h2>{stash ? 'Edit Stash' : 'New Stash'}</h2>
        <div className="editor-header-actions">
          <button className="btn btn-ghost" onClick={onCancel} title="Discard changes and go back">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} title="Save this stash">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
            </svg>
            {saving ? 'Saving...' : 'Save Stash'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="editor-form">
        <div className="form-group">
          <label>
            Name
            <InfoIcon tooltip="A short, descriptive name for this stash. Displayed in the sidebar and dashboard. If left empty, the first filename is used." />
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Docker Compose Setup, API Keys, Prompt Template..."
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>
            Description
            <InfoIcon tooltip="A longer description that helps identify the stash content and purpose. Useful for AI agents to understand what this stash contains without reading all files." />
            <span className="label-hint"> - helps AI identify the stash</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this stash contains and what it's used for..."
            className="form-textarea description-textarea"
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>
            Tags
            <InfoIcon tooltip="Tags to categorize your stash. Type to search existing tags or create new ones. Press Enter or comma to add. Tags let you filter and find stashes quickly." />
          </label>
          <TagCombobox tags={tags} onChange={setTags} availableTags={availableTags} />
        </div>

        <div className="form-group">
          <label>
            Metadata
            <InfoIcon tooltip="Key-value pairs for storing structured data like model name, agent ID, or purpose. Searchable via API/MCP. Choose from existing keys or create new ones." />
            <span className="label-hint"> - optional</span>
          </label>
          <MetadataEditor entries={metadataEntries} onChange={setMetadataEntries} availableKeys={availableMetaKeys} />
        </div>

        <div className="editor-files">
          <div className="files-header">
            <h3>
              Files
              <InfoIcon tooltip="Each stash can contain one or more files. Files are the actual content you want to store — code snippets, configs, prompts, or any text. The language is auto-detected from the file extension." />
            </h3>
            <button className="btn btn-sm btn-secondary" onClick={addFile} title="Add another file to this stash">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
              Add File
            </button>
          </div>

          {files.map((file, index) => (
            <div key={fileIds[index]} className="editor-file">
              <div className="editor-file-header">
                <input
                  type="text"
                  value={file.filename}
                  onChange={(e) => updateFile(index, 'filename', e.target.value)}
                  placeholder="filename.ext"
                  className="form-input file-name-input"
                  title="Filename with extension (e.g. config.yml, main.py). The language is auto-detected from the extension."
                />
                <input
                  type="text"
                  value={file.language}
                  onChange={(e) => updateFile(index, 'language', e.target.value)}
                  placeholder="language (auto)"
                  className="form-input file-lang-input"
                  title="Programming language. Leave blank to auto-detect from the file extension."
                />
                {files.length > 1 && (
                  <button
                    className="btn btn-sm btn-ghost btn-remove"
                    onClick={() => removeFile(index)}
                    title="Remove this file"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="code-editor-wrapper">
                <FileCodeEditor file={file} index={index} updateFile={updateFile} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
