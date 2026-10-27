import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const ID = /^[0-9a-f]{64}$/;

const isMissing = (err: unknown) =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT';

/**
 * Masters on local disk, content-addressed: <root>/<id[0:2]>/<id>.webp, 0644 in 0755 shard directories (imgproxy
 * reads them through a read-only mount, host nginx stats them). The same relative key works for an object store
 * later (`media/<id[0:2]>/<id>.webp`), so URLs survive a move to R2.
 */
export class MediaStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  static key(id: string): string {
    if (!ID.test(id)) throw new Error('invalid media id');
    return `${id.slice(0, 2)}/${id}.webp`;
  }

  pathOf(id: string): string {
    return join(this.root, MediaStorage.key(id));
  }

  async has(id: string): Promise<boolean> {
    try {
      return (await stat(this.pathOf(id))).isFile();
    } catch (err) {
      if (isMissing(err)) return false;
      throw err;
    }
  }

  /** Atomic: written to a temp file in the same directory, flushed, then renamed over the final name. */
  async write(id: string, data: Buffer): Promise<void> {
    const final = this.pathOf(id);
    const dir = join(this.root, id.slice(0, 2));
    await mkdir(dir, { recursive: true, mode: 0o755 });
    const tmp = join(dir, `.${id}.${randomBytes(6).toString('hex')}.tmp`);
    const fh = await open(tmp, 'wx', 0o644);
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    try {
      await chmod(tmp, 0o644);
      await rename(tmp, final);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  async read(id: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(id));
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  /** True when a file was deleted. */
  async remove(id: string): Promise<boolean> {
    try {
      await unlink(this.pathOf(id));
      return true;
    } catch (err) {
      if (isMissing(err)) return false;
      throw err;
    }
  }
}
