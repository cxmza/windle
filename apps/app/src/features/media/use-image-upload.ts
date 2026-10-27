import type { ApiImage, MediaKind } from '@windle/shared';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { type Prepared, prepareUpload } from './compress';
import { canRetry, isAbort, uploadErrorMessage, uploadImage } from './upload';
import { type FileInfo, inspectFile } from './validate';

interface Meta {
  name: string;
  size: number;
}

export type UploadStage = 'checking' | 'preparing' | 'uploading' | 'processing';

export type UploadPhase =
  | { status: 'empty' }
  | ({ status: 'working'; stage: UploadStage; progress: number; previewUrl: string } & Meta)
  | ({ status: 'done'; image: ApiImage; previewUrl: string | null } & Meta)
  | ({ status: 'failed'; message: string; retryable: boolean; previewUrl: string | null } & Meta);

interface Entry extends Meta {
  file: Blob;
  info: FileInfo;
  prepared: Prepared | null;
}

type Options = {
  kind: MediaKind;
  onUploaded: (image: ApiImage) => void;
  onBusyChange?: ((busy: boolean) => void) | undefined;
};

/**
 * One picture's trip: instant local preview, offline checks, optional shrinking, a real upload with progress, and the
 * way back out (cancel, retry, replace). Newer picks and cancels silence whatever the previous run still reports.
 */
export function useImageUpload({ kind, onUploaded, onBusyChange }: Options) {
  const [phase, setPhase] = useState<UploadPhase>({ status: 'empty' });
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const entryRef = useRef<Entry | null>(null);
  const runRef = useRef(0);

  const busy = phase.status === 'working';
  const reportBusy = useEffectEvent((b: boolean) => onBusyChange?.(b));
  useEffect(() => {
    reportBusy(busy);
    // Unmounting mid-upload (leaving the step) must not leave the owner thinking it is still busy.
    return () => {
      if (busy) reportBusy(false);
    };
  }, [busy]);

  useEffect(
    () => () => {
      runRef.current += 1;
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const setUrl = (next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
  };

  const begin = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    runRef.current += 1;
    return { run: runRef.current, controller };
  };

  async function send(entry: Entry, run: number, controller: AbortController) {
    const live = () => run === runRef.current;
    const previewUrl = urlRef.current;
    if (previewUrl === null) return;
    const meta: Meta = { name: entry.name, size: entry.size };
    setPhase({ status: 'working', stage: 'preparing', progress: 0, previewUrl, ...meta });
    entry.prepared ??= await prepareUpload(entry.file, entry.info);
    if (!live()) return;
    setPhase({ status: 'working', stage: 'uploading', progress: 0, previewUrl, ...meta });
    try {
      const res = await uploadImage(entry.prepared.blob, entry.prepared.type, {
        kind,
        signal: controller.signal,
        onProgress: (progress) => {
          if (live())
            setPhase((p) =>
              p.status === 'working' ? { ...p, progress, stage: progress >= 1 ? 'processing' : 'uploading' } : p,
            );
        },
      });
      if (!live()) return;
      setPhase({ status: 'done', image: res.image, previewUrl, ...meta });
      onUploaded(res.image);
    } catch (error) {
      if (!live() || isAbort(error)) return;
      setPhase({
        status: 'failed',
        message: uploadErrorMessage(error),
        retryable: canRetry(error),
        previewUrl,
        ...meta,
      });
    }
  }

  async function choose(file: File) {
    const { run, controller } = begin();
    const previewUrl = URL.createObjectURL(file);
    setUrl(previewUrl);
    entryRef.current = null;
    const meta: Meta = { name: file.name || 'Pasted image', size: file.size };
    setPhase({ status: 'working', stage: 'checking', progress: 0, previewUrl, ...meta });
    const result = await inspectFile(file);
    if (run !== runRef.current) return;
    if (!result.ok) {
      setUrl(null);
      setPhase({ status: 'failed', message: result.problem.message, retryable: false, previewUrl: null, ...meta });
      return;
    }
    const entry: Entry = { ...meta, file, info: result.info, prepared: null };
    entryRef.current = entry;
    await send(entry, run, controller);
  }

  function retry() {
    const entry = entryRef.current;
    if (!entry) return;
    const { run, controller } = begin();
    void send(entry, run, controller);
  }

  function reset() {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    entryRef.current = null;
    setUrl(null);
    setPhase({ status: 'empty' });
  }

  return { phase, busy, choose, retry, cancel: reset, clear: reset };
}
