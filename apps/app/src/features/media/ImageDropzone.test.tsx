import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageDropzone } from './ImageDropzone';
import { FakeXhr, makeImage, pngFile, stubObjectUrls } from './test-support';

let urls: ReturnType<typeof stubObjectUrls>;

beforeEach(() => {
  FakeXhr.install();
  urls = stubObjectUrls();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pick = (file: File) =>
  fireEvent.change(screen.getByLabelText('Choose an image file'), { target: { files: [file] } });
const started = () => waitFor(() => expect(FakeXhr.instances.length).toBeGreaterThan(0));

function setup(props: Partial<Parameters<typeof ImageDropzone>[0]> = {}) {
  const onUploaded = vi.fn();
  const onRemove = vi.fn();
  const onBusyChange = vi.fn();
  const view = render(
    <ImageDropzone kind="market" onUploaded={onUploaded} onRemove={onRemove} onBusyChange={onBusyChange} {...props} />,
  );
  return { ...view, onUploaded, onRemove, onBusyChange };
}

describe('ImageDropzone', () => {
  it('starts empty and offers choose, drop and paste', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(screen.getByText(/press Ctrl\+V to paste/)).toBeInTheDocument();
    expect(screen.getByLabelText('Choose an image file')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('shows the file as a preview the moment it is chosen, then uploads with real progress', async () => {
    const { onUploaded, onBusyChange } = setup();
    pick(pngFile('glow.png'));
    const preview = await screen.findByAltText('Selected file preview');
    expect(preview).toHaveAttribute('src', 'blob:preview-1');
    await started();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);

    act(() => FakeXhr.last.progress(40, 100));
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(/Uploading 40%/)).toBeInTheDocument();

    act(() => FakeXhr.last.progress(100, 100));
    expect(screen.getByText(/Processing on the server/)).toBeInTheDocument();

    const image = makeImage(5);
    act(() => FakeXhr.last.respond(201, { image, created: true }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(image));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'How it will look' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('refuses a wrong file type before any upload, with a message and no preview', async () => {
    setup();
    pick(new File([Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0])], 'cat.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a JPG, PNG or WebP image.');
    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.queryByAltText('Selected file preview')).not.toBeInTheDocument();
    expect(urls.revoke).toHaveBeenCalledWith('blob:preview-1');
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('explains a server refusal and offers retry only when it can help', async () => {
    const { onUploaded } = setup();
    pick(pngFile());
    await started();
    act(() => FakeXhr.last.respond(503, { error: { code: 'media_busy', message: 'busy' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The image service is busy. Try again in a few seconds.',
    );
    expect(screen.getByAltText('Selected file preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    const image = makeImage(6);
    act(() => FakeXhr.last.respond(201, { image, created: true }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(image));
  });

  it('does not offer retry for a file the server will never accept', async () => {
    setup();
    pick(pngFile());
    await started();
    act(() => FakeXhr.last.respond(422, { error: { code: 'media_invalid', message: 'bad' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not read that image.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another' })).toBeInTheDocument();
  });

  it('cancels an upload in flight and returns to the empty state', async () => {
    const { onUploaded, onBusyChange } = setup();
    pick(pngFile());
    await started();
    const xhr = FakeXhr.last;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(xhr.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(urls.revoke).toHaveBeenCalledWith('blob:preview-1');
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('removes the picture and tells the owner', async () => {
    const { onRemove } = setup();
    pick(pngFile());
    await started();
    act(() => FakeXhr.last.respond(201, { image: makeImage(7), created: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('shows an image the owner already holds, and replacing starts a new upload', async () => {
    const held = makeImage(8, { width: 640, height: 480 });
    setup({ value: held });
    expect(screen.getByRole('img', { name: 'Current image' })).toBeInTheDocument();
    expect(screen.getByText(/640×480/)).toBeInTheDocument();
    pick(pngFile('new.png'));
    await started();
    expect(screen.getByAltText('Selected file preview')).toBeInTheDocument();
  });

  it('takes a dropped file, and ignores drags that carry no files', async () => {
    setup();
    const zone = screen.getByRole('group');
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(zone).not.toHaveAttribute('data-dragging');
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(zone).toHaveAttribute('data-dragging');
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [pngFile('dropped.png')] } });
    expect(zone).not.toHaveAttribute('data-dragging');
    await started();
    expect(screen.getByText('dropped.png')).toBeInTheDocument();
  });

  it('takes an image pasted from the clipboard, but not while typing in a field', async () => {
    render(
      <>
        <input aria-label="Name" />
        <ImageDropzone kind="market" onUploaded={() => {}} />
      </>,
    );
    const clipboardData = { files: [pngFile('image.png')] };
    fireEvent.paste(screen.getByLabelText('Name'), { clipboardData });
    expect(FakeXhr.instances).toHaveLength(0);
    fireEvent.paste(document.body, { clipboardData });
    await started();
    expect(screen.getByText('image.png')).toBeInTheDocument();
  });

  it('ignores clipboard files that are not images', () => {
    setup();
    fireEvent.paste(document.body, {
      clipboardData: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('does nothing while disabled', () => {
    setup({ disabled: true });
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeDisabled();
    fireEvent.paste(document.body, { clipboardData: { files: [pngFile()] } });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('shows the avatar frames for the avatar kind', async () => {
    setup({ kind: 'avatar' });
    pick(pngFile());
    await started();
    act(() => FakeXhr.last.respond(201, { image: makeImage(4), created: true }));
    const frames = await screen.findByRole('list', { name: 'How it will look' });
    expect(frames).toHaveTextContent('Profile');
    expect(frames).toHaveTextContent('Menu');
    expect(frames).not.toHaveTextContent('Card');
  });

  it('a newer pick silences the older upload', async () => {
    const { onUploaded } = setup();
    pick(pngFile('first.png'));
    await started();
    const first = FakeXhr.last;
    pick(pngFile('second.png'));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    expect(first.aborted).toBe(true);
    act(() => FakeXhr.instances[1]?.respond(201, { image: makeImage(2), created: true }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded).toHaveBeenCalledWith(makeImage(2));
  });
});
