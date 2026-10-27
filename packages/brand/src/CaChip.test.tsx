import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaChip } from './CaChip.tsx';

const MINT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CaChip', () => {
  it('renders nothing without an address', () => {
    const { container } = render(<CaChip address={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the short address, the full one in the name, and a safe pump.fun link', () => {
    render(<CaChip address={MINT} />);
    const copy = screen.getByRole('button', { name: `Copy contract address ${MINT}` });
    expect(copy).toHaveAttribute('title', MINT);
    expect(copy).toHaveTextContent('CA');
    expect(copy).toHaveTextContent('7xKX…gAsU');
    const link = screen.getByRole('link', { name: /pump\.fun/ });
    expect(link).toHaveAttribute('href', `https://pump.fun/coin/${MINT}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('copies, announces "Copied" politely, then resets', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CaChip address={MINT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy contract address/ }));
    });
    expect(writeText).toHaveBeenCalledWith(MINT);
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says so when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    render(<CaChip address={MINT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy contract address/ }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
  });

  it('compact mode keeps only the copy button', () => {
    render(<CaChip address={MINT} compact />);
    expect(screen.getByRole('button', { name: /Copy contract address/ })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
