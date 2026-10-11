import { Dialog } from 'radix-ui';

const PREVIEW = `oauth.windle.fun wants you to sign in with your Solana account:
<your wallet address>

Sign in to windle

URI: https://oauth.windle.fun
Version: 1
Chain ID: mainnet
Nonce: <one-time, issued when you pick a wallet>
Issued At: <current time>`;

/** "What am I signing?" link that opens the Sign In With Solana message in a small dialog. */
export function SigningPreview({ className }: { className?: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={className}>What am I signing?</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xs border border-border-strong bg-background p-6">
          <Dialog.Title className="label">What am I signing?</Dialog.Title>
          <Dialog.Description className="sr-only">Preview of the Sign In With Solana message.</Dialog.Description>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
            {PREVIEW}
          </pre>
          <p className="text-xs leading-5 text-muted-foreground">
            A text message, not a transaction. It can’t move funds and costs nothing.
          </p>
          <Dialog.Close className="label min-h-8 self-end rounded-xs px-2 transition-colors duration-(--dur-fast) hover:text-foreground">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
