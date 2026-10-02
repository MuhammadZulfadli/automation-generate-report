import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';
import * as Diff2Html from 'diff2html';
import { minimatch } from 'minimatch';
import type { GitlabDiff } from './types';

const VIEWPORT_WIDTH = 1000;
const SCALE = 1.5;
const MIN_CHUNK = 300; // px (hasil), hindari potongan terlalu pendek

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let cssCache: string | null = null;
async function diffCss() {
  cssCache ??= await readFile(join(process.cwd(), 'node_modules/diff2html/bundles/css/diff2html.min.css'), 'utf8');
  return cssCache;
}

export function filterDiffs(diffs: GitlabDiff[], exclude: string[] = []): GitlabDiff[] {
  if (!exclude.length) return diffs;
  return diffs.filter(
    (d) => !exclude.some((p) => minimatch(d.new_path, p, { dot: true, matchBase: true })),
  );
}

function toUnified(d: GitlabDiff): string {
  const a = d.new_file ? '/dev/null' : `a/${d.old_path}`;
  const b = d.deleted_file ? '/dev/null' : `b/${d.new_path}`;
  return `diff --git a/${d.old_path} b/${d.new_path}\n--- ${a}\n+++ ${b}\n${d.diff}`;
}

export function buildHtml(diffs: GitlabDiff[], css: string): string {
  const parts = diffs.map((d) => {
    if (!d.diff.trim()) {
      const label = d.deleted_file ? 'dihapus' : d.renamed_file ? 'dipindah/rename' : 'biner / tanpa diff';
      return `<div class="d2h-file-wrapper"><div class="d2h-file-header"><span class="d2h-file-name">${esc(d.new_path)}</span></div>
        <div style="padding:12px;color:#666;font-family:sans-serif">File ${label}, diff tidak ditampilkan.</div></div>`;
    }
    return Diff2Html.html(toUnified(d), { drawFileList: false, outputFormat: 'line-by-line', matching: 'lines' });
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
    body{margin:0;background:#fff} .d2h-wrapper{width:${VIEWPORT_WIDTH}px}</style></head>
    <body>${parts.join('\n')}</body></html>`;
}

export class Screenshotter {
  private browser: Browser | null = null;

  async start() {
    this.browser = await chromium.launch();
  }

  async stop() {
    await this.browser?.close();
    this.browser = null;
  }

  /** Render diff → PNG panjang → dipotong menjadi beberapa gambar. */
  async capture(diffs: GitlabDiff[], maxSliceHeight: number): Promise<Buffer[]> {
    if (!this.browser) throw new Error('Screenshotter belum di-start');
    if (!diffs.length) return [];

    const page = await this.browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: 800 },
      deviceScaleFactor: SCALE,
    });
    try {
      await page.setContent(buildHtml(diffs, await diffCss()), { waitUntil: 'load' });

      // Posisi batas file & hunk (px hasil) sebagai titik potong yang aman.
      const boundaries: number[] = await page.evaluate((scale) => {
        const els = document.querySelectorAll('.d2h-file-wrapper, .d2h-info');
        return Array.from(els).map((el) => Math.round((el.getBoundingClientRect().top + window.scrollY) * scale));
      }, SCALE);

      const full = await page.screenshot({ fullPage: true, type: 'png' });
      return await slice(full, boundaries, maxSliceHeight);
    } finally {
      await page.close();
    }
  }
}

async function slice(png: Buffer, boundaries: number[], maxH: number): Promise<Buffer[]> {
  const { width = 0, height = 0 } = await sharp(png).metadata();
  if (height <= maxH) return [png];

  const out: Buffer[] = [];
  let pos = 0;
  while (pos < height) {
    let end = Math.min(pos + maxH, height);
    if (end < height) {
      const candidates = boundaries.filter((b) => b > pos + MIN_CHUNK && b <= end);
      if (candidates.length) end = Math.max(...candidates);
    }
    out.push(await sharp(png).extract({ left: 0, top: pos, width, height: end - pos }).png().toBuffer());
    pos = end;
  }
  return out;
}
