/**
 * The production CSP is script-src 'self' (no 'unsafe-inline'), so any inline
 * <script> in index.html silently does nothing on the live site. Guard it.
 *
 * Run: npx tsx server/tests/noInlineScripts.test.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
  ([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim().length > 0
);

if (inline.length > 0) {
  console.error(`FAIL index.html has ${inline.length} inline <script> block(s); production CSP blocks them.`);
  process.exit(1);
}
console.log('OK  index.html has no inline scripts (production CSP safe)');
