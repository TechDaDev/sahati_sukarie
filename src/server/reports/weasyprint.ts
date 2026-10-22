import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 20_000;
const MAX_ACTIVE_RENDERERS = 2;
const MAX_QUEUED_RENDERERS = 8;

class RendererQueue {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  async run<T>(job: () => Promise<T>): Promise<T> {
    let acquired = false;
    if (this.active >= MAX_ACTIVE_RENDERERS) {
      if (this.waiters.length >= MAX_QUEUED_RENDERERS) {
        throw new Error('PDF_RENDERER_BUSY');
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
      acquired = true;
    }
    if (!acquired) this.active += 1;
    try {
      return await job();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

const queue = new RendererQueue();

export function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return Promise.reject(new Error('PDF_RENDER_INPUT_TOO_LARGE'));
  }
  return queue.run(() => renderInSubprocess(html));
}

async function renderInSubprocess(html: string): Promise<Uint8Array> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sahati-pdf-'));
  const python = process.env.SAHATI_PDF_RENDERER_PYTHON ?? '/opt/sahati-weasyprint/bin/python';
  const script = path.join(process.cwd(), 'scripts', 'render_pdf.py');
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const child = spawn(python, [script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          NODE_ENV: 'production',
          HOME: tempDir,
          TMPDIR: tempDir,
          XDG_CACHE_HOME: tempDir,
          XDG_CONFIG_HOME: tempDir,
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          PATH: '/usr/local/bin:/usr/bin:/bin',
        },
      });
      child.stderr.resume();
      const chunks: Buffer[] = [];
      let outputBytes = 0;
      let timedOut = false;
      let outputTooLarge = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, RENDER_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_PDF_BYTES) {
          outputTooLarge = true;
          child.kill('SIGKILL');
          return;
        }
        chunks.push(chunk);
      });
      child.once('error', () => reject(new Error('PDF_RENDERER_UNAVAILABLE')));
      child.once('close', (code) => {
        clearTimeout(timer);
        if (timedOut) return reject(new Error('PDF_RENDER_TIMEOUT'));
        if (outputTooLarge) return reject(new Error('PDF_RENDER_OUTPUT_TOO_LARGE'));
        if (code !== 0) return reject(new Error('PDF_RENDER_FAILED'));
        const pdf = Buffer.concat(chunks, outputBytes);
        if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
          return reject(new Error('PDF_RENDER_INVALID_OUTPUT'));
        }
        resolve(new Uint8Array(pdf));
      });
      child.stdin.once('error', () => child.kill('SIGKILL'));
      child.stdin.end(html, 'utf8');
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
