import { type RouteObject, redirect } from 'react-router';
import { SessionGate } from '@/features/session/SessionGate';
import { RouteError } from './RouteError';

// Data-router table. Both layouts are gated: nothing below renders without a session.
// "/" is the full-bleed markets home (own chrome); the account pages keep the shell. Pages are lazy so the shell
// (or the home's poster) paints before page code arrives.
export const routes: RouteObject[] = [
  {
    path: '/',
    errorElement: <RouteError />,
    children: [
      {
        element: <SessionGate layout="bare" />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('@/features/markets/MarketsHome')).MarketsHome }),
          },
        ],
      },
      {
        element: <SessionGate />,
        children: [
          { path: 'dashboard', lazy: async () => ({ Component: (await import('./Dashboard')).Dashboard }) },
          { path: 'promises', lazy: async () => ({ Component: (await import('./Promises')).Promises }) },
          // the old placeholder page; markets now live on the home, this keeps old links working
          { path: 'markets', loader: () => redirect('/?view=list') },
          { path: 'account', lazy: async () => ({ Component: (await import('./Account')).Account }) },
          { path: '*', lazy: async () => ({ Component: (await import('./NotFound')).NotFound }) },
        ],
      },
    ],
  },
];
