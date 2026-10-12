import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ProjectsMenu } from './ProjectsMenu';

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" aria-expanded={open} aria-controls="menu" onClick={() => setOpen((o) => !o)}>
        Projects
      </button>
      <ProjectsMenu
        id="menu"
        open={open}
        triggerRef={ref}
        onClose={({ restoreFocus }) => {
          setOpen(false);
          if (restoreFocus) ref.current?.focus();
        }}
      />
    </>
  );
}

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Harness />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('projects menu', () => {
  it('opens with focus in the search field, lists projects and closes on Escape returning focus', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Projects' });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'projects' });
    const search = within(dialog).getByRole('searchbox', { name: 'Search projects' });
    expect(search).toHaveFocus();
    expect(await within(dialog).findAllByRole('link', { name: /odds it ships/ })).toHaveLength(5);
    expect(within(dialog).getByRole('link', { name: /All projects/ })).toHaveAttribute('href', '/projects');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(dialog).toHaveAttribute('inert');
  });

  it('filters by search and status pills, and carries them to the catalog link', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    const dialog = await screen.findByRole('dialog', { name: 'projects' });
    await within(dialog).findAllByRole('link', { name: /odds it ships/ });

    fireEvent.click(within(dialog).getByRole('button', { name: 'slashed' }));
    expect(within(dialog).getByRole('button', { name: 'slashed' })).toHaveAttribute('aria-pressed', 'true');
    const rows = within(dialog).getAllByRole('link', { name: /odds it ships/ });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Pale Ember');

    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'nothing-here' } });
    expect(within(dialog).getByRole('status')).toHaveTextContent('No project matches');
    expect(within(dialog).getByRole('link', { name: /All projects/ })).toHaveAttribute(
      'href',
      '/projects?q=nothing-here&status=slashed',
    );
  });

  it('closes when a pointer lands outside', async () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    const dialog = await screen.findByRole('dialog', { name: 'projects' });
    expect(dialog).not.toHaveAttribute('inert');
    fireEvent.pointerDown(document.body);
    expect(dialog).toHaveAttribute('inert');
  });
});
