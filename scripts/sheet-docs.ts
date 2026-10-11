/** Regenerates docs/GOOGLE-SHEETS.md from src/lib/catalog/schema.ts:  npm run docs:sheets */
import { writeFileSync } from 'node:fs';
import { SETTINGS_KEYS, TABS } from '../src/lib/catalog/schema.ts';

const esc = (s: string) => s.replace(/\|/g, '\\|');
let md = `# Google Sheets content guide

_Generated from \`src/lib/catalog/schema.ts\` — run \`npm run docs:sheets\` after changing the schema._

Every tab in \`content/demo/\` is a ready-made template: in Google Sheets use **File → Import → Upload**, choose the CSV, and pick **Insert new sheet(s)**. Name each tab as in the table titles below (the CHIPKU menu matches them).

## Rules that apply to every tab

- Row 1 holds the column names. Column order does not matter, and extra columns are ignored, so you can keep your own notes columns.
- IDs (\`product_id\`, \`variant_id\`, …) are permanent. Links between tabs always use IDs, never row numbers or titles, so you can sort and reorder rows freely.
- Prices are plain numbers in rupees (\`149\`, not \`₹149\`). Currency is INR.
- \`TRUE\`/\`FALSE\` columns also accept yes/no and 1/0. A blank \`active\` or \`status\` means active.
- Images must be **direct image links** from Cloudflare R2 (e.g. \`https://img.chipku.in/posters/pst-0001.jpg\`). Google Drive/Photos viewer links are rejected. One image per row (use the Media tab for more).
- Text is shown as plain text. HTML or formulas are never executed on the site.
- Only reviews with **approved = TRUE** and **publish_permission = TRUE** are shown on the site.
- **Anything in a published sheet can be read by anyone who has the link.** Keep customer emails, phone numbers, order IDs, verification evidence and not-yet-approved reviews out of the published spreadsheet.

## What blocks publishing vs. what only warns

| Errors — the site is **not** updated, the last good version stays live | Warnings — published, problem row handled safely |
| --- | --- |
| Missing required column, duplicate ID, link to an ID that does not exist, broken offer rule, unsafe button link, Hero tab missing | Missing/invalid price (item shows “Currently unavailable”), image link that does not load (neutral placeholder shown), unknown category on a product, hero slide count other than 5 |

The latest warnings are listed at \`/data/content-report.json\` on the site after each publish.

`;

for (const tab of TABS) {
  md += `## ${tab.title}${tab.requiredLive ? ' (required)' : ''}\n\n${tab.purpose}\n\n| Column | Required | What it does | Example |\n| --- | --- | --- | --- |\n`;
  for (const c of tab.columns) {
    md += `| \`${c.name}\` | ${c.required ? 'Yes' : ''} | ${esc(c.description)} | ${c.example ? `\`${esc(c.example)}\`` : ''} |\n`;
  }
  if (tab.key === 'settings') {
    md += `\n### Settings keys\n\n| Key | What it does | Example |\n| --- | --- | --- |\n`;
    for (const k of SETTINGS_KEYS) md += `| \`${k.key}\` | ${esc(k.description)} | ${k.example ? `\`${esc(k.example)}\`` : ''} |\n`;
  }
  md += '\n';
}

writeFileSync(new URL('../docs/GOOGLE-SHEETS.md', import.meta.url), md);
console.log('docs/GOOGLE-SHEETS.md written');
