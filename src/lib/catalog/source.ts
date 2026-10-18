/**
 * Where tab CSVs come from.
 *
 * - Preview: content/demo/<tab>.csv (an isolated demo catalogue with ₹69 example prices).
 * - Live: Google Sheets configured in content/sheets.json or CHIPKU_SHEETS_CONFIG — either
 *   a sheet shared "Anyone with the link can view" (spreadsheetUrl, read through Google's
 *   CSV export) or a "Publish to web" link (publishedUrl).
 * - Snapshot: CHIPKU_SHEETS_SNAPSHOT=<folder of <tab>.csv files> builds a live catalogue
 *   from saved CSVs (offline testing, reproducing a build).
 *
 * A live build never falls back to demo data. If a configured tab cannot be fetched
 * the build fails, and Cloudflare Pages keeps serving the last good deployment.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TABS, type TabKey } from './schema.ts';
import type { CatalogMode } from '../types.ts';

export interface SheetsConfig {
  /** Normal sheet link (…/spreadsheets/d/<id>/edit…) shared "Anyone with the link can view". */
  spreadsheetUrl?: string;
  /** "Publish to web" link (…/spreadsheets/d/e/2PACX-…/pub…). */
  publishedUrl?: string;
  tabs?: Partial<Record<TabKey, string | number | null>>;
}

export interface TabSource {
  mode: CatalogMode;
  /** Human-readable description for logs. */
  describe(): string;
  /** CSV text, or null when the tab is not configured. */
  read(tab: TabKey): Promise<string | null>;
}

const ROOT = process.cwd();

async function loadConfig(): Promise<SheetsConfig> {
  const fromEnv = process.env.CHIPKU_SHEETS_CONFIG;
  if (fromEnv && fromEnv.trim()) {
    try {
      return JSON.parse(fromEnv) as SheetsConfig;
    } catch (err) {
      throw new Error(`CHIPKU_SHEETS_CONFIG is not valid JSON: ${(err as Error).message}`);
    }
  }
  const file = join(ROOT, 'content', 'sheets.json');
  if (!existsSync(file)) return {};
  return JSON.parse(await readFile(file, 'utf8')) as SheetsConfig;
}

function isConfigured(cfg: SheetsConfig): boolean {
  return Object.values(cfg.tabs ?? {}).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
}

/** Build the CSV URL for a tab entry (gid or full link). */
export function resolveTabUrl(cfg: SheetsConfig, value: string | number): string {
  const v = String(value).trim();
  if (/^https:\/\//i.test(v)) {
    const url = new URL(v);
    if (url.hostname === 'docs.google.com' && url.pathname.includes('/pub')) {
      url.searchParams.set('output', 'csv');
      if (url.searchParams.has('gid')) url.searchParams.set('single', 'true');
    }
    return url.toString();
  }
  if (!/^\d+$/.test(v)) throw new Error(`Tab value "${v}" must be a gid number or an https:// CSV link.`);

  // Link-shared sheet: https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>
  const shared = (cfg.spreadsheetUrl ?? '').match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (shared) {
    return `https://docs.google.com/spreadsheets/d/${shared[1]}/export?format=csv&gid=${v}`;
  }
  if (!cfg.publishedUrl) throw new Error(`Tab gid ${v} needs "spreadsheetUrl" or "publishedUrl" in the sheets config.`);
  const base = new URL(cfg.publishedUrl.trim());
  // Accept .../pubhtml, .../pub?output=csv etc. and normalise to .../pub
  base.pathname = base.pathname.replace(/\/pub(html)?$/, '/pub');
  if (!base.pathname.endsWith('/pub')) base.pathname = base.pathname.replace(/\/?$/, '/pub');
  base.search = '';
  base.searchParams.set('gid', v);
  base.searchParams.set('single', 'true');
  base.searchParams.set('output', 'csv');
  return base.toString();
}

async function fetchCsv(url: string, tab: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      const text = await res.text();
      if (type.includes('text/html') || /^\s*<!doctype html/i.test(text)) {
        throw new Error('received a web page instead of CSV — share the sheet as "Anyone with the link can view" (or publish it to the web as CSV)');
      }
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(`Could not fetch the "${tab}" tab (${url}): ${(lastError as Error)?.message ?? lastError}`);
}

export async function createTabSource(): Promise<TabSource> {
  const snapshot = process.env.CHIPKU_SHEETS_SNAPSHOT;
  if (snapshot) {
    return {
      mode: 'live',
      describe: () => `sheet snapshot (${snapshot})`,
      async read(tab) {
        const file = join(snapshot, `${tab}.csv`);
        return existsSync(file) ? readFile(file, 'utf8') : null;
      },
    };
  }
  const cfg = await loadConfig();
  const requireLive = process.env.CHIPKU_REQUIRE_LIVE === '1' || process.env.CHIPKU_REQUIRE_LIVE === 'true';

  if (!isConfigured(cfg)) {
    if (requireLive) {
      throw new Error(
        'CHIPKU_REQUIRE_LIVE is set but no Google Sheets tabs are configured. Refusing to publish the preview catalogue.',
      );
    }
    const dir = join(ROOT, 'content', 'demo');
    return {
      mode: 'preview',
      describe: () => `preview catalogue (${dir})`,
      async read(tab) {
        const file = join(dir, `${tab}.csv`);
        return existsSync(file) ? readFile(file, 'utf8') : null;
      },
    };
  }

  const urls = new Map<TabKey, string>();
  for (const spec of TABS) {
    const value = cfg.tabs?.[spec.key];
    if (value === null || value === undefined || String(value).trim() === '') continue;
    urls.set(spec.key, resolveTabUrl(cfg, value));
  }
  return {
    mode: 'live',
    describe: () => `Google Sheets (${urls.size} tabs configured)`,
    async read(tab) {
      const url = urls.get(tab);
      return url ? fetchCsv(url, tab) : null;
    },
  };
}
