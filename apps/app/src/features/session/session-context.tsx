import type { Session } from '@windle/shared';
import { createContext, use } from 'react';

export type AuthedSession = Extract<Session, { authenticated: true }>;

export interface SignOutControl {
  run(): void;
  pending: boolean;
  failed: boolean;
}

interface SessionContextValue {
  session: AuthedSession;
  signOut: SignOutControl;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/** The signed-in session. Only valid below <SessionGate>, which renders children for authenticated visitors only. */
export function useAuthedSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useAuthedSession must be used inside <SessionGate>');
  return value;
}
