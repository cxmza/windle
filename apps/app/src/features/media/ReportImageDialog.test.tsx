import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketHeader } from '../predict/market/MarketHeader';
import { renderWith } from '../predict/test-render';
import { FakeApi, makeMarket } from '../predict/test-support';
import { resetReported } from './reported';
import { makeImage } from './test-support';

const image = makeImage(11);
let fake: FakeApi;

beforeEach(() => {
  window.localStorage.clear();
  resetReported();
  fake = new FakeApi({ markets: [] }).install();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openMenu = () => fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'Enter' });

function renderHeader(withImage = true) {
  return renderWith(<MarketHeader market={makeMarket({ image: withImage ? image : null })} />);
}

describe('Report image', () => {
  it('is offered in the overflow menu only when the market has an image', async () => {
    renderHeader(false);
    openMenu();
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Report image' })).not.toBeInTheDocument();
    cleanup();
    renderHeader();
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Report image' })).toBeInTheDocument();
  });

  it('needs a reason, sends it with the note, then shows Reported', async () => {
    renderHeader();
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Report image' }));
    const dialog = await screen.findByRole('dialog', { name: 'Report this image' });
    const send = within(dialog).getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Spam or a scam' }));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  A fake giveaway  ' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => expect(fake.callsTo('POST', `/v1/media/${image.id}/report`)).toHaveLength(1));
    expect(fake.callsTo('POST', '/report')[0]?.body).toEqual({ reason: 'spam', note: 'A fake giveaway' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Image reported. Thank you.')).toBeInTheDocument();

    openMenu();
    const done = await screen.findByRole('menuitem', { name: 'Image reported' });
    expect(done).toHaveAttribute('aria-disabled', 'true');
  });

  it('omits the note when it is blank', async () => {
    renderHeader();
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Report image' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Impersonation' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(fake.callsTo('POST', '/report')).toHaveLength(1));
    expect(fake.callsTo('POST', '/report')[0]?.body).toEqual({ reason: 'impersonation' });
  });

  it('treats "already reported" as reported', async () => {
    fake.reportedImages.add(image.id);
    renderHeader();
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Report image' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Something else' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('You already reported this image.')).toBeInTheDocument();
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Image reported' })).toBeInTheDocument();
  });

  it('keeps the dialog open with a readable error when the report fails', async () => {
    fake.override = (path) =>
      path.endsWith('/report')
        ? new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } }), { status: 429 })
        : undefined;
    renderHeader();
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Report image' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Violence or gore' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many requests. Wait a minute');
    expect(within(dialog).getByRole('button', { name: 'Send report' })).toBeEnabled();
  });
});
