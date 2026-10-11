import type { RouteObject } from 'react-router';
import { SessionGate } from '@/features/session/SessionGate';
import { RouteError } from './RouteError';

// Data-router table. The gate is the layout route: nothing below renders without a session.
// Pages are lazy so the shell paints before page code arrives.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <SessionGate />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./Dashboard')).Dashboard }) },
      { path: 'promises', lazy: async () => ({ Component: (await import('./Promises')).Promises }) },
      { path: 'markets', lazy: async () => ({ Component: (await import('./Markets')).Markets }) },
      { path: 'account', lazy: async () => ({ Component: (await import('./Account')).Account }) },
      { path: '*', lazy: async () => ({ Component: (await import('./NotFound')).NotFound }) },
    ],
  },
];
