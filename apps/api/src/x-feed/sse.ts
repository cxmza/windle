/** One parsed Server-Sent Event (`comment` is set for `:` lines, which carry no event). */
export interface SseMessage {
  event: string;
  data: string;
  comment?: string;
}

/** Frames one event. `data` must not contain newlines (JSON.stringify output never does). */
export function sseFrame(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

export const ssePing = ': ping\n\n';

export function sseRetry(ms: number): string {
  return `retry: ${Math.round(ms)}\n\n`;
}

/**
 * Incremental parser for the text/event-stream format (WHATWG HTML §9.2.6), enough for a trusted upstream:
 * events, multi-line data, comments. `id`/`retry` fields are ignored. A line longer than maxLineBytes throws.
 */
export class SseParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];
  private readonly maxLine: number;

  constructor(maxLineBytes = 1 << 20) {
    this.maxLine = maxLineBytes;
  }

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    let start = 0;
    for (;;) {
      const nl = this.buffer.indexOf('\n', start);
      if (nl === -1) break;
      let line = this.buffer.slice(start, nl);
      start = nl + 1;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      const message = this.line(line);
      if (message) out.push(message);
    }
    this.buffer = this.buffer.slice(start);
    if (this.buffer.length > this.maxLine) throw new Error('SSE line exceeds the size limit');
    return out;
  }

  private line(line: string): SseMessage | undefined {
    if (line === '') {
      if (this.data.length === 0) {
        this.event = '';
        return undefined;
      }
      const message = { event: this.event || 'message', data: this.data.join('\n') };
      this.event = '';
      this.data = [];
      return message;
    }
    if (line.startsWith(':')) return { event: '', data: '', comment: line.slice(1).trim() };
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
    return undefined;
  }
}
