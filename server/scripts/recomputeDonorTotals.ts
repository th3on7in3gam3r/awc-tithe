import 'dotenv/config';
import { ensureSchema } from '../db';
import { recomputeAllDonorTotals } from '../gifts/store';

const apply = process.argv.includes('--apply');

await ensureSchema();
const preview = await recomputeAllDonorTotals(false);
console.log(`Mode: ${preview.mode}`);
console.log(`Donors whose stored totals differ from completed donations: ${preview.changes.length}`);
for (const row of preview.changes) {
  console.log(
    `${row.email}: lifetime ${row.lifetimeGiving} -> ${row.nextLifetime}, count ${row.totalGiftsCount} -> ${row.nextCount}`
  );
}

if (!apply) {
  console.log('Dry run only. Re-run with --apply to write these totals.');
  process.exit(0);
}

const applied = await recomputeAllDonorTotals(true);
console.log(`Applied ${applied.changes.length} donor total updates.`);
