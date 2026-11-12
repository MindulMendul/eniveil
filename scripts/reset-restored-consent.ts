import { Database } from 'bun:sqlite';
import { resetRestoredConsent } from '../apps/server/src/infrastructure/sqlite/reset-restored-consent';
const path = process.argv[2];
if (!path || process.argv.length !== 3) throw new Error('Usage: bun scripts/reset-restored-consent.ts /path/to/restored.sqlite (application must be stopped)');
const db = new Database(path, { create: false });
try { resetRestoredConsent(db); console.log('Restored consent and optional analytics cleared; operational game state and ratings preserved.'); }
finally { db.close(); }
