import { MEDIA_REPORT_REASONS, type MediaReportReason } from '@windle/shared';
import { Dialog, RadioGroup } from 'radix-ui';
import { useId, useState } from 'react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { ApiRequestError } from '@/lib/api';
import { useReportImage } from './hooks';
import { mediaErrorMessage } from './upload';

export const REASON_LABEL: Readonly<Record<MediaReportReason, string>> = {
  csam: 'Child sexual abuse material',
  sexual: 'Sexual or explicit content',
  violence: 'Violence or gore',
  hate: 'Hate or harassment',
  impersonation: 'Impersonation',
  spam: 'Spam or a scam',
  copyright: 'Copyright infringement',
  other: 'Something else',
};

type Props = { imageId: string; open: boolean; onOpenChange: (open: boolean) => void };

const NOTE_MAX = 500;

function ReportForm({ imageId, onClose }: { imageId: string; onClose: () => void }) {
  const toast = useToast();
  const report = useReportImage(imageId);
  const base = useId();
  const [reason, setReason] = useState<MediaReportReason | null>(null);
  const [note, setNote] = useState('');

  const submit = () => {
    if (!reason) return;
    const text = note.trim();
    report.mutate(
      { reason, ...(text ? { note: text } : {}) },
      {
        onSuccess: () => {
          toast('Image reported. Thank you.');
          onClose();
        },
        onError: (error) => {
          if (!(error instanceof ApiRequestError) || error.code !== 'media_already_reported') return;
          toast('You already reported this image.');
          onClose();
        },
      },
    );
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Dialog.Title className="text-base font-semibold text-balance">Report this image</Dialog.Title>
        <Dialog.Description className="text-sm text-pretty text-muted-foreground">
          Tell us what is wrong with it. Reports go to our moderators.
        </Dialog.Description>
      </div>
      <RadioGroup.Root
        value={reason ?? ''}
        onValueChange={(v) => setReason(MEDIA_REPORT_REASONS.find((r) => r === v) ?? null)}
        aria-label="Reason"
        className="grid gap-1"
      >
        {MEDIA_REPORT_REASONS.map((r) => (
          <label
            key={r}
            htmlFor={`${base}-${r}`}
            className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring [@media(hover:hover)]:hover:bg-(--hover)"
          >
            <RadioGroup.Item
              id={`${base}-${r}`}
              value={r}
              className="flex size-4 shrink-0 items-center justify-center rounded-full border border-(--control-border) outline-none data-[state=checked]:border-accent"
            >
              <RadioGroup.Indicator className="size-2 rounded-full bg-accent" />
            </RadioGroup.Item>
            {REASON_LABEL[r]}
          </label>
        ))}
      </RadioGroup.Root>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
        <span>
          Details <span className="font-normal text-muted-foreground">optional</span>
        </span>
        <textarea
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className="w-full min-w-0 resize-y rounded-md border border-(--control-border) bg-background px-3 py-2 text-sm font-normal text-foreground"
        />
      </label>
      {report.error ? (
        <p role="alert" className="text-sm text-(--no)">
          {mediaErrorMessage(report.error, 'Could not send the report. Try again.')}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button variant="secondary" disabled={report.isPending}>
            Cancel
          </Button>
        </Dialog.Close>
        <Button onClick={submit} disabled={!reason || report.isPending}>
          {report.isPending ? 'Sending…' : 'Send report'}
        </Button>
      </div>
    </>
  );
}

export function ReportImageDialog({ imageId, open, onOpenChange }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-scrim className="fixed inset-0 z-(--z-pencil) bg-scrim" />
        <Dialog.Content
          data-popover
          className="fixed top-1/2 left-1/2 z-(--z-pencil) flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-(--hairline) bg-surface-raised p-5 text-foreground"
        >
          {open ? <ReportForm imageId={imageId} onClose={() => onOpenChange(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
