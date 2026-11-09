import type { Database } from 'bun:sqlite';
/** Run on a restored database BEFORE opening traffic; keep operational state and ratings. */
export function resetRestoredConsent(db: Database) {
  db.transaction(() => {
    const exists = (table: string) => !!db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (exists('story_run_events')) db.exec('DELETE FROM story_run_events');
    if (exists('story_rum_vitals')) db.exec('DELETE FROM story_rum_vitals');
    if (exists('collection_records')) db.exec('DELETE FROM collection_records');
    if (exists('collection_consents')) db.exec('DELETE FROM collection_consents');
  })();
}
