import type { ApiImage } from '@windle/shared';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useMyAvatar, useSetAvatar } from './hooks';
import { ImageDropzone } from './ImageDropzone';
import { mediaErrorMessage } from './upload';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** The change-avatar form. Mounted only while the dialog is open, so every opening starts from the saved avatar. */
function AvatarForm({ onClose }: { onClose: () => void }) {
  const current = useMyAvatar();
  const toast = useToast();
  const setAvatar = useSetAvatar();
  // undefined: nothing changed yet; an image: uploaded, not saved; null: remove on save.
  const [next, setNext] = useState<ApiImage | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const value = next === undefined ? current : next;

  const save = () => {
    if (next === undefined) return;
    setAvatar.mutate(next?.id ?? null, {
      onSuccess: () => {
        toast(next ? 'Avatar updated' : 'Avatar removed');
        onClose();
      },
    });
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Dialog.Title className="text-base font-semibold text-balance">Change avatar</Dialog.Title>
        <Dialog.Description className="text-sm text-pretty text-muted-foreground">
          It shows next to your wallet on the leaderboard and in trade activity.
        </Dialog.Description>
      </div>
      <ImageDropzone
        kind="avatar"
        value={value}
        title="Drop a picture here"
        onUploaded={setNext}
        onRemove={() => setNext(null)}
        onBusyChange={setBusy}
        disabled={setAvatar.isPending}
      />
      {setAvatar.error ? (
        <p role="alert" className="text-sm text-(--no)">
          {mediaErrorMessage(setAvatar.error, 'Could not update your avatar. Try again.')}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button variant="secondary" disabled={setAvatar.isPending}>
            Cancel
          </Button>
        </Dialog.Close>
        <Button onClick={save} disabled={next === undefined || busy || setAvatar.isPending}>
          {setAvatar.isPending ? 'Saving…' : next === null ? 'Remove avatar' : 'Save'}
        </Button>
      </div>
    </>
  );
}

export function AvatarDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-scrim className="fixed inset-0 z-(--z-pencil) bg-scrim" />
        <Dialog.Content
          data-popover
          className="fixed top-1/2 left-1/2 z-(--z-pencil) flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-(--hairline) bg-surface-raised p-5 text-foreground"
        >
          {open ? <AvatarForm onClose={() => onOpenChange(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
