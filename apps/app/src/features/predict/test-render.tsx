import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@/components/Toast';

export function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** The providers every exchange screen needs: query cache, router and toasts. */
export function Providers({
  children,
  client,
  route = '/',
}: {
  children: ReactNode;
  client: QueryClient;
  route?: string;
}) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>{children}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWith(ui: ReactNode, route = '/') {
  const client = newClient();
  const view = render(
    <Providers client={client} route={route}>
      {ui}
    </Providers>,
  );
  return { ...view, client };
}
