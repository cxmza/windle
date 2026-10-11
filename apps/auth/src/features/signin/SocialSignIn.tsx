import { useQuery } from '@tanstack/react-query';
import type { AuthProvider } from '@windle/shared';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/Button';
import { authApi } from '@/lib/api';
import { API_URL } from '@/lib/env';

type SocialId = Extract<AuthProvider, 'google' | 'telegram' | 'discord'>;

const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;

/** Monochrome glyphs (currentColor), drawn inline: no brand colours, no network. */
const SOCIALS: ReadonlyArray<{ id: SocialId; label: string; icon: ReactNode }> = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg {...iconProps} focusable="false">
        <title>Google</title>
        <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
      </svg>
    ),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: (
      <svg {...iconProps} focusable="false">
        <title>Telegram</title>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: (
      <svg {...iconProps} focusable="false">
        <title>Discord</title>
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    ),
  },
];

/** "or" divider + one pill per social provider. Disabled (or unknown) providers render as inert "Soon" pills. */
export function SocialSignIn({ target, locked }: { target: string; locked: boolean }) {
  const { data } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: ({ signal }) => authApi.getProviders(signal),
  });
  const enabled = new Set(data?.providers.filter((p) => p.enabled).map((p) => p.id));

  return (
    <>
      <div className="my-2 flex items-center gap-3 text-xs leading-4 text-muted-foreground">
        <hr className="m-0 h-px flex-1 border-0 bg-foreground/12" />
        <span>or</span>
        <hr className="m-0 h-px flex-1 border-0 bg-foreground/12" />
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Other ways to sign in">
        {SOCIALS.map(({ id, label, icon }) => {
          const live = enabled.has(id) && !locked;
          const content = (
            <>
              <span className="shrink-0">{icon}</span>
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="truncate">{label}</span>
                {enabled.has(id) ? null : (
                  <span className="text-[0.625rem] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground">
                    Soon
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={id} className="flex">
              {live ? (
                <LinkButton
                  variant="secondary"
                  inset="compact"
                  href={`${API_URL}/v1/auth/${id}/start?return_to=${encodeURIComponent(target)}`}
                  aria-label={`Sign in with ${label}`}
                >
                  {content}
                </LinkButton>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-label={enabled.has(id) ? `Sign in with ${label}` : `Sign in with ${label} — coming soon`}
                  className="flex h-14 w-full items-center rounded-full border border-foreground/12 bg-foreground/6 text-left text-sm font-medium leading-none text-foreground opacity-50 gap-2.5 px-4 sm:px-3.5"
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
