import { type RouteObject, redirect } from 'react-router';
import { SessionGate } from '@/features/session/SessionGate';
import { PageFrame } from '@/shell/PageFrame';
import { RouteError } from './RouteError';

// Data-router table. Everything is gated and drawn inside the sidebar shell: nothing below renders without a session.
// "/" is the full-bleed markets home (it fills the content area); every other page sits in a padded PageFrame.
// Pages are lazy so the shell paints before page code arrives.
export const routes: RouteObject[] = [
  {
    path: '/',
    errorElement: <RouteError />,
    children: [
      {
        element: <SessionGate />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('@/features/markets/MarketsHome')).MarketsHome }),
          },
          {
            element: <PageFrame />,
            children: [
              {
                path: 'm/:slug',
                lazy: async () => ({ Component: (await import('@/features/predict/market/MarketPage')).MarketPage }),
              },
            ],
          },
          {
            element: <PageFrame stack />,
            children: [
              {
                path: 'create',
                lazy: async () => ({
                  Component: (await import('@/features/predict/create/CreateMarketPage')).CreateMarketPage,
                }),
              },
              {
                path: 'leaderboard',
                lazy: async () => ({
                  Component: (await import('@/features/leaderboard/LeaderboardPage')).LeaderboardPage,
                }),
              },
              {
                path: 'portfolio',
                lazy: async () => ({
                  Component: (await import('@/features/predict/portfolio/PortfolioPage')).PortfolioPage,
                }),
              },
              // the old placeholder pages; portfolio and create replaced them, this keeps old links working
              { path: 'dashboard', loader: () => redirect('/portfolio') },
              { path: 'promises', loader: () => redirect('/create') },
              // projects were a view over fixture promises; the markets home replaced them, this keeps old links working
              { path: 'projects/*', loader: () => redirect('/') },
              // the old placeholder page; markets now live on the home, this keeps old links working
              { path: 'markets', loader: () => redirect('/') },
              // account lives in the settings dialog now; this keeps old links working
              { path: 'account', loader: () => redirect('/?settings=account') },
              { path: '*', lazy: async () => ({ Component: (await import('./NotFound')).NotFound }) },
            ],
          },
        ],
      },
    ],
  },
];
