import type { Database } from "bun:sqlite";
import type { Guest, StoryPackage } from "@festival/shared";
import type { WorkshopDraftInput, WorkshopStory } from "../../modules/workshop/model";

type DraftRow = {
  id: string;
  owner_id: string;
  author_name: string;
  story_json: string;
  thumbnail_url: string | null;
  difficulty: WorkshopStory["difficulty"];
  published: number;
  published_at: string | null;
  updated_at: string;
};

/** Keeps editable packages private; public readers receive only explicit metadata. */
export class SQLiteWorkshopStore {
  constructor(private readonly db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workshop_drafts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        story_json TEXT NOT NULL,
        package_json TEXT NOT NULL,
        thumbnail_url TEXT,
        difficulty TEXT CHECK (difficulty IN ('easy', 'normal', 'hard')),
        published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
        published_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS workshop_drafts_owner_idx
        ON workshop_drafts(owner_id, updated_at);
      CREATE INDEX IF NOT EXISTS workshop_drafts_published_idx
        ON workshop_drafts(published, published_at);
      CREATE TABLE IF NOT EXISTS workshop_favorites (
        story_id TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (story_id, guest_id)
      );
      CREATE INDEX IF NOT EXISTS workshop_favorites_guest_idx
        ON workshop_favorites(guest_id, story_id);
    `);
  }

  list(guestId?: string): WorkshopStory[] {
    const rows = this.db.query(`
      SELECT id, owner_id, author_name, story_json, thumbnail_url, difficulty,
        published, published_at, updated_at
      FROM workshop_drafts WHERE published=1 OR owner_id=?
    `).all(guestId ?? "") as DraftRow[];
    return rows.map((row) => this.metadata(row));
  }

  get(id: string): WorkshopStory | undefined {
    const row = this.db.query(`
      SELECT id, owner_id, author_name, story_json, thumbnail_url, difficulty,
        published, published_at, updated_at
      FROM workshop_drafts WHERE id=?
    `).get(id) as DraftRow | null;
    return row ? this.metadata(row) : undefined;
  }

  source(id: string, ownerId: string): StoryPackage | undefined {
    const row = this.db.query(
      "SELECT package_json FROM workshop_drafts WHERE id=? AND owner_id=?",
    ).get(id, ownerId) as { package_json: string } | null;
    return row ? JSON.parse(row.package_json) as StoryPackage : undefined;
  }

  create(owner: Guest, draft: WorkshopDraftInput): WorkshopStory {
    const id = `community-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.query(`
      INSERT INTO workshop_drafts (
        id, owner_id, author_name, story_json, package_json, thumbnail_url,
        difficulty, published, published_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, owner.id, owner.nickname, JSON.stringify(draft.package.story),
      JSON.stringify(draft.package), draft.thumbnailUrl, draft.difficulty,
      Number(draft.published), draft.published ? now : null, now,
    );
    return this.get(id)!;
  }

  update(id: string, owner: Guest, draft: WorkshopDraftInput): WorkshopStory | undefined {
    const now = new Date().toISOString();
    const result = this.db.query(`
      UPDATE workshop_drafts SET author_name=?, story_json=?, package_json=?,
        thumbnail_url=?, difficulty=?, published=?,
        published_at=CASE WHEN ?=1 THEN COALESCE(published_at, ?) ELSE published_at END,
        updated_at=? WHERE id=? AND owner_id=?
    `).run(
      owner.nickname, JSON.stringify(draft.package.story), JSON.stringify(draft.package),
      draft.thumbnailUrl, draft.difficulty, Number(draft.published),
      Number(draft.published), now, now, id, owner.id,
    );
    return result.changes ? this.get(id) : undefined;
  }

  favorite(storyId: string, guestId: string, selected: boolean) {
    if (selected) {
      this.db.query(`
        INSERT OR IGNORE INTO workshop_favorites (story_id, guest_id, created_at)
        VALUES (?, ?, ?)
      `).run(storyId, guestId, new Date().toISOString());
    } else {
      this.db.query("DELETE FROM workshop_favorites WHERE story_id=? AND guest_id=?")
        .run(storyId, guestId);
    }
  }

  favorites(guestId?: string) {
    const rows = this.db.query(`
      SELECT story_id, COUNT(*) AS count,
        MAX(CASE WHEN guest_id=? THEN 1 ELSE 0 END) AS selected
      FROM workshop_favorites GROUP BY story_id
    `).all(guestId ?? "") as { story_id: string; count: number; selected: number }[];
    return new Map(rows.map((row) => [row.story_id, {
      count: row.count,
      selected: row.selected === 1,
    }]));
  }

  private metadata(row: DraftRow): WorkshopStory {
    return {
      id: row.id,
      story: JSON.parse(row.story_json) as StoryPackage["story"],
      author: { id: row.owner_id, name: row.author_name },
      thumbnailUrl: row.thumbnail_url,
      difficulty: row.difficulty,
      published: row.published === 1,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }
}
