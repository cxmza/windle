import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@/styles.css';
import { AppProviders } from '@/providers';
import { routes } from '@/routes';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
