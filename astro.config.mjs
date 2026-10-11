// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL is the public origin (e.g. https://chipku.in). It is used for canonical
// links and social cards. Set it in the Cloudflare Pages environment.
const site = process.env.SITE_URL || undefined;

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  devToolbar: { enabled: false },
});
