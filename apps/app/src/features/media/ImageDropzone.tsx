import { type ApiImage, MEDIA_MAX_UPLOAD_BYTES, MEDIA_UPLOAD_TYPES, type MediaKind } from '@windle/shared';
import { type DragEvent, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { FramePreview } from './FramePreview';
import { AlertIcon, ImageIcon } from './icons';
import { ProgressRing } from './ProgressRing';
import { SmartImage } from './SmartImage';
import { type UploadPhase, useImageUpload } from './use-image-upload';
import { formatBytes } from './validate';

type Props = {
  kind: MediaKind;
  /** The image already attached (a restored draft, the current avatar), shown until a new file is chosen. */
  value?: ApiImage | null | undefined;
  onUploaded: (image: ApiImage) => void;
  /** Called after Remove; the owner clears its copy of the image. */
  onRemove?: () => void;
  /** True while a file is being checked, prepared or sent, so the owner can hold back "Next" and "Save". */
  onBusyChange?: (busy: boolean) => void;
  title?: string;
  disabled?: boolean;
  className?: string;
};

const ACCEPT = MEDIA_UPLOAD_TYPES.join(',');

const STAGE_TEXT = {
  checking: 'Checking the file…',
  preparing: 'Optimizing for a faster upload…',
  processing: 'Processing on the server…',
} as const;

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

const isTypingTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || t.closest('input:not([type=file]), textarea, select') !== null);

function statusText(phase: UploadPhase, hasValue: boolean): string {
  if (phase.status === 'working') {
    return phase.stage === 'uploading' ? `Uploading ${Math.round(phase.progress * 100)}%` : STAGE_TEXT[phase.stage];
  }
  if (phase.status === 'failed') return 'Upload failed';
  if (phase.status === 'done') return 'Uploaded';
  return hasValue ? 'Ready' : '';
}

/**
 * Pick, drop or paste a JPG, PNG or WebP. The picture shows at once from the file itself; the upload runs behind it
 * with real progress and returns the stored image. The server crops squares, so frames below show an approximation.
 */
export function ImageDropzone({
  kind,
  value,
  onUploaded,
  onRemove,
  onBusyChange,
  title = 'Drop an image here',
  disabled = false,
  className = '',
}: Props) {
  const upload = useImageUpload({ kind, onUploaded, onBusyChange });
  const { phase } = upload;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const errorId = useId();

  const take = (file: File | undefined) => {
    if (file && !disabled) void upload.choose(file);
  };

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    take(file);
  });
  useEffect(() => {
    if (disabled) return;
    const listener = (e: ClipboardEvent) => onPaste(e);
    document.addEventListener('paste', listener);
    return () => document.removeEventListener('paste', listener);
  }, [disabled]);

  // A finished upload only counts while the owner still holds that image; if it cleared it, show what it holds.
  const shown =
    phase.status === 'empty' || (phase.status === 'done' && value !== undefined && value?.id !== phase.image.id)
      ? null
      : phase;
  const previewUrl = shown ? shown.previewUrl : null;
  const image = shown?.status === 'done' ? shown.image : (value ?? null);
  const hasPicture = previewUrl !== null || image !== null;
  const failure = shown?.status === 'failed' ? shown : null;
  const working = shown?.status === 'working' ? shown : null;
  const frameSrc = previewUrl ?? image?.urls.card ?? null;

  const choose = () => inputRef.current?.click();
  const remove = () => {
    upload.clear();
    onRemove?.();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add a legend and a border this card does not want
    <div
      role="group"
      aria-label={kind === 'avatar' ? 'Profile picture' : 'Image'}
      aria-describedby={failure ? `${hintId} ${errorId}` : hintId}
      data-dropzone
      data-kind={kind}
      data-state={working ? 'working' : failure ? 'failed' : hasPicture ? 'filled' : 'empty'}
      data-dragging={dragging || undefined}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files[0]);
      }}
      className={`flex flex-col gap-4 rounded-xl border border-dashed border-(--control-border) bg-surface p-4 transition-colors duration-(--dur-instant) ease-(--ease-standard) data-[dragging]:border-accent data-[dragging]:bg-(--hover) ${disabled ? 'opacity-60' : ''} ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-label="Choose an image file"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />

      {hasPicture ? (
        <div className="grid items-center gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-lg border border-(--hairline) bg-muted max-sm:mx-auto">
            {previewUrl ? (
              <img src={previewUrl} alt="Selected file preview" draggable={false} className="size-full object-cover" />
            ) : image ? (
              <SmartImage image={image} preset="thumb" alt="Current image" className="size-full" />
            ) : null}
            {working ? (
              <div className="absolute inset-0 flex items-center justify-center bg-scrim">
                <ProgressRing
                  label="Upload progress"
                  value={working.stage === 'uploading' ? working.progress : working.stage === 'processing' ? 1 : null}
                />
              </div>
            ) : null}
            {failure ? (
              <div className="absolute inset-0 flex items-center justify-center bg-scrim text-(--loss)">
                <AlertIcon size={28} />
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground" title={shown?.name}>
                {shown?.name ?? 'Current image'}
              </p>
              <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
                {shown ? `${formatBytes(shown.size)} · ` : null}
                {statusText(shown ?? { status: 'empty' }, image !== null)}
                {image && !working ? ` · ${image.width}×${image.height}` : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {working ? (
                <Button variant="secondary" size="sm" onClick={upload.cancel}>
                  Cancel
                </Button>
              ) : (
                <>
                  {failure?.retryable ? (
                    <Button size="sm" onClick={upload.retry} disabled={disabled}>
                      Try again
                    </Button>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={choose} disabled={disabled}>
                    {failure ? 'Choose another' : 'Replace'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={remove} disabled={disabled}>
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImageIcon size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              or press Ctrl+V to paste. JPG, PNG or WebP, up to {formatBytes(MEDIA_MAX_UPLOAD_BYTES)}.
            </p>
          </div>
          <Button variant="secondary" onClick={choose} disabled={disabled}>
            Choose file
          </Button>
        </div>
      )}

      {hasPicture ? (
        <p id={hintId} className="sr-only">
          JPG, PNG or WebP, up to {formatBytes(MEDIA_MAX_UPLOAD_BYTES)}. Drop or paste a new one to replace it.
        </p>
      ) : null}

      {failure ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-(--loss)">
          {failure.message}
        </p>
      ) : null}

      {frameSrc && !failure ? <FramePreview src={frameSrc} kind={kind} /> : null}
    </div>
  );
}
