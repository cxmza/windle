import { SolanaSignIn } from '@solana/wallet-standard-features';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { useEffect, useState } from 'react';

/** Wallet Standard registry (Phantom, Backpack, Solflare, ... register themselves into it). */
const registry = getWallets();

const supportsSignIn = (wallet: Wallet) => SolanaSignIn in wallet.features;

/** Installed wallets that implement `solana:signIn` (SIWS), kept live as wallets register/unregister. */
export function useSignInWallets(): readonly Wallet[] {
  const [wallets, setWallets] = useState(() => registry.get().filter(supportsSignIn));
  useEffect(() => {
    const update = () => setWallets(registry.get().filter(supportsSignIn));
    const offs = [registry.on('register', update), registry.on('unregister', update)];
    update();
    return () => {
      for (const off of offs) off();
    };
  }, []);
  return wallets;
}
