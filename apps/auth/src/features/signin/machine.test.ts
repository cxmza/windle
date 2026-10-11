import { describe, expect, it } from 'vitest';
import { initialSignInState, type SignInAction, type SignInState, signInReducer } from './machine';

const run = (actions: SignInAction[], from: SignInState = initialSignInState) => actions.reduce(signInReducer, from);

describe('signInReducer', () => {
  it('checking -> idle when anonymous, -> signed-in when a session exists', () => {
    expect(run([{ type: 'session-checked', address: null }])).toEqual({ phase: 'idle' });
    expect(run([{ type: 'session-checked', address: 'abc' }])).toMatchObject({ phase: 'signed-in', address: 'abc' });
  });

  it('happy path: idle -> signing (nonce, signature, verify) -> success', () => {
    const s = run([
      { type: 'session-checked', address: null },
      { type: 'start', wallet: 'Phantom' },
      { type: 'step', step: 'signature' },
      { type: 'step', step: 'verify' },
    ]);
    expect(s).toEqual({ phase: 'signing', wallet: 'Phantom', step: 'verify' });
    expect(run([{ type: 'succeeded', address: 'abc' }], s)).toEqual({ phase: 'success', address: 'abc' });
  });

  it('rejected and error are separate phases and both reset to idle', () => {
    const signing = run([
      { type: 'session-checked', address: null },
      { type: 'start', wallet: 'Phantom' },
    ]);
    const rejected = run([{ type: 'failed', failure: { kind: 'rejected' } }], signing);
    expect(rejected).toEqual({ phase: 'rejected', wallet: 'Phantom' });
    const errored = run([{ type: 'failed', failure: { kind: 'network', message: 'offline' } }], signing);
    expect(errored).toMatchObject({ phase: 'error', failure: { kind: 'network' } });
    expect(run([{ type: 'reset' }], rejected)).toEqual({ phase: 'idle' });
    expect(run([{ type: 'reset' }], errored)).toEqual({ phase: 'idle' });
  });

  it('ignores a second start while signing and any start while checking or signed in', () => {
    const signing: SignInState = { phase: 'signing', wallet: 'Phantom', step: 'signature' };
    expect(run([{ type: 'start', wallet: 'Backpack' }], signing)).toBe(signing);
    expect(run([{ type: 'start', wallet: 'Backpack' }])).toBe(initialSignInState);
    const signedIn: SignInState = { phase: 'signed-in', address: 'a', signingOut: false, signOutFailed: false };
    expect(run([{ type: 'start', wallet: 'Backpack' }], signedIn)).toBe(signedIn);
  });

  it('ignores stale async results once the phase moved on', () => {
    const idle: SignInState = { phase: 'idle' };
    expect(run([{ type: 'succeeded', address: 'a' }], idle)).toBe(idle);
    expect(run([{ type: 'failed', failure: { kind: 'rejected' } }], idle)).toBe(idle);
    expect(run([{ type: 'step', step: 'verify' }], idle)).toBe(idle);
  });

  it('sign out: signed-in -> pending -> idle, or pending -> failed (stays signed in)', () => {
    const signedIn: SignInState = { phase: 'signed-in', address: 'a', signingOut: false, signOutFailed: false };
    const pending = run([{ type: 'sign-out-started' }], signedIn);
    expect(pending).toMatchObject({ signingOut: true });
    expect(run([{ type: 'sign-out-done' }], pending)).toEqual({ phase: 'idle' });
    expect(run([{ type: 'sign-out-failed' }], pending)).toMatchObject({ signingOut: false, signOutFailed: true });
  });
});
