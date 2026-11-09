import { afterEach, expect, setSystemTime, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MANAGED_IMAGES, storyPackageSchema, type StoryPackage } from "@festival/shared";
import { Store } from "../../store";
import { SQLiteStoryRunStore } from "../../infrastructure/sqlite/story-run-store";
import { SQLiteWorkshopStore, WorkshopQuotaError, type WorkshopLimits } from "../../infrastructure/sqlite/workshop-store";
import { FileStoryCatalog } from "../platform/stories/file-catalog";
import { createWorkshopRoutes } from "./routes";
import type { WorkshopItem } from "./model";

const cleanups: (() => void)[] = [];
afterEach(() => { setSystemTime(); for (const cleanup of cleanups.splice(0)) cleanup(); });

function fixture(limits: Partial<WorkshopLimits> | ((source: StoryPackage) => Partial<WorkshopLimits>) = {}, diskBacked = false) {
  const directory = mkdtempSync(join(tmpdir(), "festival-workshop-"));
  const source = storyPackageSchema.parse(JSON.parse(readFileSync(join(import.meta.dir, "../../../stories/deokil-trading-murder.mstory"), "utf8")));
  const first = structuredClone(source);
  first.story.id = "first-story";
  first.story.title = "Alpha story";
  first.story.version = 1;
  const newest = structuredClone(first);
  newest.story.title = "Latest Alpha";
  newest.story.version = 2;
  const second = structuredClone(source);
  second.story.id = "second-story";
  second.story.title = "Beta story";
  for (const [name, story] of Object.entries({ first, newest, second }))
    writeFileSync(join(directory, `${name}.mstory`), JSON.stringify(story));
  const databasePath = diskBacked ? join(directory, "workshop.sqlite") : ":memory:";
  const store = new Store(databasePath);
  const runs = new SQLiteStoryRunStore(store.db);
  const workshop = new SQLiteWorkshopStore(store.db, typeof limits === "function" ? limits(source) : limits);
  const stories = new FileStoryCatalog(directory);
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "too large" }, 413) }));
  app.route("/api/workshop", createWorkshopRoutes({ store, runs, workshop, stories }));
  app.onError((_error, c) => c.json({ error: "Invalid input" }, 400));
  cleanups.push(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const guest = (nickname: string) => {
    const person = { id: crypto.randomUUID(), nickname };
    store.state.guests[person.id] = person;
    return { ...person, cookie: `festival_guest=${store.issue(person.id)}` };
  };
  const request = (path: string, options: { method?: string; cookie?: string; body?: unknown; raw?: string } = {}) =>
    app.request(`http://localhost/api/workshop${path}`, {
      method: options.method ?? "GET",
      headers: { Cookie: options.cookie ?? "", "Content-Type": "application/json" },
      body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
  const create = async (cookie: string, published = false, extra: Record<string, unknown> = {}) => {
    const response = await request("/drafts", {
      method: "POST", cookie, body: { package: source, published, ...extra },
    });
    expect(response.status).toBe(201);
    return (await response.json() as { item: WorkshopItem }).item;
  };
  const list = async (path = "/stories", cookie = "") => {
    const response = await request(path, { cookie });
    expect(response.status).toBe(200);
    return await response.json() as { items: WorkshopItem[]; total: number; offset: number; limit: number };
  };
  return { source, store, runs, workshop, stories, guest, request, create, list, databasePath };
}

test("anonymous catalog exposes only the latest version and public metadata", async () => {
  const f = fixture();
  const response = await f.request("/stories");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json() as { items: WorkshopItem[]; total: number };
  expect(body.total).toBe(2);
  expect(body.items.find((item) => item.id === "first-story")?.version).toBe(2);
  expect(body.items.every((item) => !item.canEdit && !item.isFavorite)).toBe(true);
  const serialized = JSON.stringify(body);
  for (const key of ["content", "solution", "startSceneId", "package_json", "owner_id"])
    expect(serialized).not.toContain(`"${key}"`);
  expect((await f.request("/stories/missing")).status).toBe(404);
});

function payloadBytes(source: StoryPackage, nickname: string, thumbnailUrl = "") {
  return Buffer.byteLength(JSON.stringify(source)) + Buffer.byteLength(JSON.stringify(source.story)) +
    Buffer.byteLength(nickname) + Buffer.byteLength(thumbnailUrl);
}

test("guest and global draft count quotas reject concurrent creates without removing existing data", async () => {
  const f = fixture({ guestDrafts: 1, totalDrafts: 2 });
  const owner = f.guest("Owner");
  const other = f.guest("Other");
  const third = f.guest("Third");
  const attempts = await Promise.all(Array.from({ length: 2 }, () => f.request("/drafts", {
    method: "POST", cookie: owner.cookie, body: { package: f.source },
  })));
  expect(attempts.map((response) => response.status).sort()).toEqual([201, 429]);
  const first = (await attempts.find((response) => response.status === 201)!.json() as { item: WorkshopItem }).item;
  const second = await f.create(other.cookie);
  expect((await f.request("/drafts", { method: "POST", cookie: third.cookie, body: { package: f.source } })).status).toBe(429);
  const growing = structuredClone(f.source);
  growing.story.title += " revised";
  // Editing an existing record excludes its own count and size from quota totals.
  expect((await f.request(`/drafts/${first.id}`, { method: "PUT", cookie: owner.cookie, body: { package: growing } })).status).toBe(200);
  expect(f.workshop.source(second.id, other.id)).toEqual(f.source);
  expect((f.store.db.query("SELECT COUNT(*) AS count FROM workshop_drafts").get() as { count: number }).count).toBe(2);
  expect(f.store.db.inTransaction).toBe(false);
});

test("guest byte quotas count UTF-8 source and metadata and permit exact-boundary replacement", async () => {
  const f = fixture((source) => ({ guestBytes: payloadBytes(source, "A"), totalBytes: payloadBytes(source, "A") * 4 }));
  const owner = f.guest("A");
  const other = f.guest("B");
  const item = await f.create(owner.cookie);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: f.source } })).status).toBe(413);
  await f.create(other.cookie);
  const grow = structuredClone(f.source);
  grow.story.title += "한";
  expect(payloadBytes(grow, owner.nickname) - payloadBytes(f.source, owner.nickname)).toBe(6);
  expect((await f.request(`/drafts/${item.id}`, { method: "PUT", cookie: owner.cookie, body: { package: grow } })).status).toBe(413);
  expect((await f.request(`/drafts/${item.id}`, { method: "PUT", cookie: owner.cookie, body: { package: f.source, thumbnailUrl: MANAGED_IMAGES.invitation } })).status).toBe(413);
  expect(f.workshop.source(item.id, owner.id)).toEqual(f.source);
  const smaller = structuredClone(f.source);
  smaller.story.title = "A";
  expect((await f.request(`/drafts/${item.id}`, { method: "PUT", cookie: owner.cookie, body: { package: smaller } })).status).toBe(200);
  expect((await f.request(`/drafts/${item.id}`, { method: "PUT", cookie: owner.cookie, body: { package: f.source } })).status).toBe(200);
  expect(f.workshop.source(item.id, owner.id)).toEqual(f.source);
  expect(f.store.db.inTransaction).toBe(false);
});

test("global byte quotas apply across creators and shrinking updates release space", async () => {
  const f = fixture((source) => ({ guestBytes: payloadBytes(source, "A") * 4, totalBytes: payloadBytes(source, "A") * 2 }));
  const a = f.guest("A"), b = f.guest("B"), c = f.guest("C");
  const first = await f.create(a.cookie);
  const second = await f.create(b.cookie);
  expect((await f.request("/drafts", { method: "POST", cookie: c.cookie, body: { package: f.source } })).status).toBe(413);
  const growing = structuredClone(f.source);
  growing.story.title += "x";
  expect((await f.request(`/drafts/${second.id}`, { method: "PUT", cookie: b.cookie, body: { package: growing } })).status).toBe(413);
  expect(f.workshop.source(second.id, b.id)).toEqual(f.source);
  const smaller = structuredClone(f.source);
  smaller.story.title = "A";
  expect((await f.request(`/drafts/${first.id}`, { method: "PUT", cookie: a.cookie, body: { package: smaller } })).status).toBe(200);
  expect((await f.request(`/drafts/${second.id}`, { method: "PUT", cookie: b.cookie, body: { package: growing } })).status).toBe(200);
});

test("lower quotas preserve legacy records and allow same-size or decreasing edits", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const first = await f.create(owner.cookie);
  const second = await f.create(owner.cookie);
  const countLimited = new SQLiteWorkshopStore(f.store.db, { guestDrafts: 1, totalDrafts: 1 });
  const growing = structuredClone(f.source);
  growing.story.title += " larger existing story";
  expect(countLimited.update(first.id, owner, { package: growing, published: false, difficulty: null, thumbnailUrl: null })?.id).toBe(first.id);
  const limited = new SQLiteWorkshopStore(f.store.db, { guestDrafts: 1, totalDrafts: 1, guestBytes: 1, totalBytes: 1 });
  const draft = { package: f.source, published: false, difficulty: null, thumbnailUrl: null };
  expect(limited.update(first.id, owner, draft)?.id).toBe(first.id);
  const smaller = structuredClone(f.source);
  smaller.story.title = "A";
  expect(limited.update(first.id, owner, { ...draft, package: smaller })?.id).toBe(first.id);
  expect(() => limited.update(first.id, owner, draft)).toThrow(WorkshopQuotaError);
  expect(limited.source(second.id, owner.id)).toEqual(f.source);
  expect(limited.list(owner.id)).toHaveLength(2);
  expect((f.store.db.query("SELECT COUNT(*) AS count FROM workshop_drafts").get() as { count: number }).count).toBe(2);
});

test("SQLite triggers track old-image writers and startup repairs nonzero stale byte counts", async () => {
  const f = fixture((source) => ({ guestBytes: payloadBytes(source, "A") * 10, totalBytes: payloadBytes(source, "A") * 2 }), true);
  const owner = f.guest("A");
  const first = await f.create(owner.cookie);
  const legacy = new Database(f.databasePath);
  try {
    const modified = structuredClone(f.source);
    modified.story.title += "한글";
    const actualBytes = payloadBytes(modified, owner.nickname);
    // An old image updates source/metadata without knowing the payload_bytes column exists.
    legacy.query("UPDATE workshop_drafts SET package_json=?, story_json=? WHERE id=?")
      .run(JSON.stringify(modified), JSON.stringify(modified.story), first.id);
    const recorded = () => (f.store.db.query("SELECT payload_bytes FROM workshop_drafts WHERE id=?").get(first.id) as { payload_bytes: number }).payload_bytes;
    expect(recorded()).toBe(actualBytes);
    legacy.query(`INSERT INTO workshop_drafts (
      id, owner_id, author_name, story_json, package_json, thumbnail_url, difficulty,
      published, published_at, updated_at
    ) SELECT ?, owner_id, author_name, story_json, package_json, thumbnail_url, difficulty,
      published, published_at, updated_at FROM workshop_drafts WHERE id=?`)
      .run("community-legacy-insert", first.id);
    expect((f.store.db.query("SELECT payload_bytes FROM workshop_drafts WHERE id=?").get("community-legacy-insert") as { payload_bytes: number }).payload_bytes).toBe(actualBytes);
    expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: f.source } })).status).toBe(413);
    legacy.query("UPDATE workshop_drafts SET payload_bytes=1 WHERE id=?").run(first.id);
    new SQLiteWorkshopStore(f.store.db);
    expect(recorded()).toBe(actualBytes);
    expect(f.workshop.source(first.id, owner.id)).toEqual(modified);
  } finally {
    legacy.close();
  }
});

test("legacy owners retain every item, accurate filtered totals and growing edits above the count limit", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const oldest = await f.create(owner.cookie);
  const source = structuredClone(f.source);
  source.story.title = "needle oldest legacy";
  f.store.db.query("UPDATE workshop_drafts SET story_json=?, package_json=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(source.story), JSON.stringify(source), "2000-01-01T00:00:00.000Z", oldest.id);
  for (let index = 1; index < 25; index++) {
    f.store.db.query(`INSERT INTO workshop_drafts (
      id, owner_id, author_name, story_json, package_json, published, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?)`)
      .run(`community-legacy-${index}`, owner.id, owner.nickname, JSON.stringify(f.source.story), JSON.stringify(f.source), "2026-11-06T01:00:00.000Z");
  }
  const page = await f.list("/stories?view=mine&limit=24", owner.cookie);
  expect(page.total).toBe(25);
  expect(page.items).toHaveLength(24);
  expect((await f.list("/stories?view=mine&limit=24&offset=24", owner.cookie)).items.map((item) => item.id)).toEqual([oldest.id]);
  const search = await f.list("/stories?view=mine&q=needle&author=Owner", owner.cookie);
  expect(search.total).toBe(1);
  expect(search.items[0].id).toBe(oldest.id);
  source.story.title += " expanded";
  expect((await f.request(`/drafts/${oldest.id}`, { method: "PUT", cookie: owner.cookie, body: { package: source } })).status).toBe(200);
  expect(f.workshop.source(oldest.id, owner.id)).toEqual(source);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: f.source } })).status).toBe(429);
  expect((await f.list("/stories?view=mine", owner.cookie)).total).toBe(25);
});

test("global creation budget survives new guest IDs and database connections and expires automatically", async () => {
  const f = fixture({ globalCreatesPerMinute: 2 }, true);
  const a = f.guest("A"), b = f.guest("B"), c = f.guest("C");
  setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
  const first = await f.create(a.cookie);
  await f.create(b.cookie);
  expect((await f.request("/drafts", { method: "POST", cookie: c.cookie, body: { package: f.source } })).status).toBe(429);
  const reopened = new Database(f.databasePath);
  try {
    const independent = new SQLiteWorkshopStore(reopened, { globalCreatesPerMinute: 2 });
    expect(() => independent.create(c, { package: f.source, published: false, difficulty: null, thumbnailUrl: null })).toThrow(WorkshopQuotaError);
  } finally {
    reopened.close();
  }
  const updated = structuredClone(f.source);
  updated.story.title += " update without creation budget";
  expect((await f.request(`/drafts/${first.id}`, { method: "PUT", cookie: a.cookie, body: { package: updated } })).status).toBe(200);
  setSystemTime(new Date("2026-11-06T10:00:59.999Z"));
  expect((await f.request("/drafts", { method: "POST", cookie: c.cookie, body: { package: f.source } })).status).toBe(429);
  setSystemTime(new Date("2026-11-06T10:01:00.000Z"));
  await f.create(c.cookie);
  expect((f.store.db.query("SELECT creations FROM workshop_creation_budget WHERE id=1").get() as { creations: number }).creations).toBe(1);
});

test("rejected storage quotas do not consume the persistent creation budget", async () => {
  const f = fixture((source) => ({ guestBytes: payloadBytes(source, "A"), globalCreatesPerMinute: 1 }));
  const owner = f.guest("A");
  const oversized = structuredClone(f.source);
  oversized.story.title += "x";
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: oversized } })).status).toBe(413);
  await f.create(owner.cookie);
  expect((f.store.db.query("SELECT creations FROM workshop_creation_budget WHERE id=1").get() as { creations: number }).creations).toBe(1);
});

test("concurrent creators share one global creation budget", async () => {
  const f = fixture({ globalCreatesPerMinute: 1 });
  const creators = [f.guest("A"), f.guest("B")];
  const responses = await Promise.all(creators.map((guest) => f.request("/drafts", {
    method: "POST", cookie: guest.cookie, body: { package: f.source },
  })));
  expect(responses.map((response) => response.status).sort()).toEqual([201, 429]);
  expect((f.store.db.query("SELECT COUNT(*) AS count FROM workshop_drafts").get() as { count: number }).count).toBe(1);
  expect((f.store.db.query("SELECT creations FROM workshop_creation_budget WHERE id=1").get() as { creations: number }).creations).toBe(1);
  expect(f.store.db.inTransaction).toBe(false);
});

test("legacy databases backfill stored payload bytes without deleting packages", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const item = await f.create(owner.cookie);
  // Recreate the pre-quota schema without leaving newer triggers behind.
  f.store.db.exec("DROP TRIGGER workshop_payload_insert; DROP TRIGGER workshop_payload_update;");
  f.store.db.exec("ALTER TABLE workshop_drafts DROP COLUMN payload_bytes");
  const migrated = new SQLiteWorkshopStore(f.store.db, { totalBytes: payloadBytes(f.source, owner.nickname) });
  expect((f.store.db.query("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('workshop_payload_insert', 'workshop_payload_update')").get() as { count: number }).count).toBe(2);
  expect((f.store.db.query("SELECT payload_bytes FROM workshop_drafts WHERE id=?").get(item.id) as { payload_bytes: number }).payload_bytes)
    .toBe(payloadBytes(f.source, owner.nickname));
  expect(migrated.source(item.id, owner.id)).toEqual(f.source);
  expect(() => migrated.create(owner, { package: f.source, published: false, difficulty: null, thumbnailUrl: null })).toThrow(WorkshopQuotaError);
  expect(migrated.get(item.id)?.id).toBe(item.id);
  f.store.db.query("UPDATE workshop_drafts SET payload_bytes=0 WHERE id=?").run(item.id);
  new SQLiteWorkshopStore(f.store.db);
  expect((f.store.db.query("SELECT payload_bytes FROM workshop_drafts WHERE id=?").get(item.id) as { payload_bytes: number }).payload_bytes)
    .toBe(payloadBytes(f.source, owner.nickname));
});

test("public catalog work has an independent deterministic cap and old records remain addressable", async () => {
  const f = fixture({ guestDrafts: 10, totalDrafts: 20, publicCatalogLimit: 2 });
  const owner = f.guest("Owner");
  const created: WorkshopItem[] = [];
  for (let index = 0; index < 5; index++) {
    setSystemTime(new Date(`2026-11-06T0${index}:00:00.000Z`));
    created.push(await f.create(owner.cookie, true));
  }
  expect(f.workshop.list().map((item) => item.id)).toEqual([created[4].id, created[3].id]);
  const metrics = spyOn(f.runs, "catalogMetrics");
  const publicList = await f.list();
  expect(publicList.total).toBe(4); // Two bounded community entries plus two trusted file stories.
  expect(metrics.mock.calls[0][0]).toHaveLength(4);
  expect((await f.list("/stories?view=mine", owner.cookie)).total).toBe(5);
  expect((await f.request(`/stories/${created[0].id}`)).status).toBe(200);
  expect((await f.request(`/drafts/${created[0].id}`, { cookie: owner.cookie })).status).toBe(200);
});

test("personal lists, source access and writes require a current guest session", async () => {
  const f = fixture();
  for (const [path, method] of [
    ["/stories?view=mine", "GET"], ["/stories?view=favorites", "GET"],
    ["/drafts/unknown", "GET"], ["/drafts", "POST"], ["/drafts/unknown", "PUT"],
    ["/stories/first-story/favorite", "PUT"], ["/stories/first-story/favorite", "DELETE"],
  ]) expect((await f.request(path, { method })).status).toBe(401);
  const owner = f.guest("Owner");
  f.store.db.query("UPDATE credentials SET expires=0").run();
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: f.source } })).status).toBe(401);
  expect((await f.request("/stories?view=mine", { cookie: owner.cookie })).status).toBe(401);
  expect((await f.request("/stories", { cookie: owner.cookie })).status).toBe(200);
});

test("draft source and edits belong to the server-authenticated creator", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const other = f.guest("Other");
  const item = await f.create(owner.cookie, false, { difficulty: "hard", thumbnailUrl: MANAGED_IMAGES.invitation });
  expect(item.id).not.toBe(f.source.story.id);
  expect(item.author).toEqual({ id: owner.id, name: owner.nickname });
  expect(item.canEdit).toBe(true);
  expect((await f.list()).total).toBe(2);
  expect((await f.list("/stories", owner.cookie)).total).toBe(2);
  expect((await f.list("/stories?view=mine", owner.cookie)).items.map((entry) => entry.id)).toEqual([item.id]);
  expect((await f.list("/stories?view=mine", other.cookie)).total).toBe(0);
  expect((await f.request(`/stories/${item.id}`)).status).toBe(404);
  const loaded = await f.request(`/drafts/${item.id}`, { cookie: owner.cookie });
  expect(loaded.status).toBe(200);
  expect((await loaded.json() as { package: StoryPackage }).package).toEqual(f.source);
  for (const cookie of [other.cookie, "festival_guest=forged"])
    expect((await f.request(`/drafts/${item.id}`, { cookie })).status).toBe(cookie === other.cookie ? 404 : 401);
  expect((await f.request(`/drafts/${item.id}`, {
    method: "PUT", cookie: other.cookie, body: { package: f.source, published: true },
  })).status).toBe(404);
  expect((await f.request("/drafts/first-story", { cookie: owner.cookie })).status).toBe(404);
  const revised = structuredClone(f.source);
  revised.story.title = "Revised community story";
  const updated = await f.request(`/drafts/${item.id}`, {
    method: "PUT", cookie: owner.cookie, body: { package: revised, published: true, difficulty: "hard" },
  });
  expect(updated.status).toBe(200);
  const publicItem = (await f.list()).items.find((entry) => entry.id === item.id)!;
  expect(publicItem.title).toBe(revised.story.title);
  expect(publicItem.publishedAt).toBeString();
  expect(publicItem.canEdit).toBe(false);
  expect((await f.request(`/drafts/${item.id}`, { cookie: other.cookie })).status).toBe(404);
  expect(JSON.stringify(await (await f.request(`/stories/${item.id}`)).json())).not.toContain('"solution"');
});

test("favorites are persistent, idempotent and selected separately for each guest", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const other = f.guest("Other");
  const endpoint = "/stories/first-story/favorite";
  for (let i = 0; i < 2; i++) expect((await f.request(endpoint, { method: "PUT", cookie: owner.cookie })).status).toBe(200);
  const selected = (await f.list("/stories?view=favorites", owner.cookie)).items;
  expect(selected).toHaveLength(1);
  expect(selected[0].favoriteCount).toBe(1);
  expect(selected[0].isFavorite).toBe(true);
  expect((await f.list("/stories?view=favorites", other.cookie)).total).toBe(0);
  const anonymous = (await f.list()).items.find((item) => item.id === "first-story")!;
  expect(anonymous.favoriteCount).toBe(1);
  expect(anonymous.isFavorite).toBe(false);
  expect((await f.request(endpoint, { method: "PUT", cookie: other.cookie })).status).toBe(200);
  expect((await f.list("/stories?favoritesMin=2")).total).toBe(1);
  for (let i = 0; i < 2; i++) expect((await f.request(endpoint, { method: "DELETE", cookie: owner.cookie })).status).toBe(200);
  expect((await f.list("/stories?view=favorites", owner.cookie)).total).toBe(0);
  expect((await f.request("/stories/unknown/favorite", { method: "PUT", cookie: owner.cookie })).status).toBe(404);
  // A fresh adapter over the existing database keeps the other guest's selection.
  expect(new SQLiteWorkshopStore(f.store.db).favorites(["first-story"], other.id).get("first-story")).toEqual({ count: 1, selected: true });
});

test("unpublishing clears publication time and republishing updates latest/date filters", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  setSystemTime(new Date("2026-11-06T01:00:00.000Z"));
  const first = await f.create(owner.cookie, true);
  expect(first.publishedAt).toBe("2026-11-06T01:00:00.000Z");
  setSystemTime(new Date("2026-11-06T02:00:00.000Z"));
  const second = await f.create(owner.cookie, true);
  const save = async (published: boolean) => {
    const response = await f.request(`/drafts/${first.id}`, {
      method: "PUT", cookie: owner.cookie, body: { package: f.source, published },
    });
    expect(response.status).toBe(200);
    return (await response.json() as { item: WorkshopItem }).item;
  };
  expect((await f.list("/stories?sort=latest")).items[0].id).toBe(second.id);
  setSystemTime(new Date("2026-11-06T03:00:00.000Z"));
  expect((await save(false)).publishedAt).toBeNull();
  expect((await f.list("/stories?view=mine&publishedAfter=2026-11-06", owner.cookie)).items.map((item) => item.id)).toEqual([second.id]);
  // Private rows created before this fix may still hold an obsolete publication date.
  f.store.db.query("UPDATE workshop_drafts SET published_at=? WHERE id=?")
    .run(first.publishedAt, first.id);
  setSystemTime(new Date("2026-11-07T01:00:00.000Z"));
  expect((await save(true)).publishedAt).toBe("2026-11-07T01:00:00.000Z");
  expect((await f.list("/stories?sort=latest")).items[0].id).toBe(first.id);
  expect((await f.list("/stories?publishedAfter=2026-11-07")).items.map((item) => item.id)).toEqual([first.id]);
  setSystemTime(new Date("2026-11-08T01:00:00.000Z"));
  expect((await save(true)).publishedAt).toBe("2026-11-07T01:00:00.000Z");
});

test("detail, favorite and draft responses read only the requested story's metadata and statistics", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const draft = await f.create(owner.cookie, true);
  seedPlay(f, "unrelated-history", 5);
  f.workshop.favorite("unrelated-history", owner.id, true);
  const metadataList = spyOn(f.workshop, "list");
  const fileList = spyOn(f.stories, "list");
  const metrics = spyOn(f.runs, "catalogMetrics");
  const favorites = spyOn(f.workshop, "favorites");
  for (const [path, method, id] of [
    ["/stories/first-story", "GET", "first-story"],
    ["/stories/first-story/favorite", "PUT", "first-story"],
    ["/stories/first-story/favorite", "DELETE", "first-story"],
    [`/drafts/${draft.id}`, "GET", draft.id],
    [`/drafts/${draft.id}`, "PUT", draft.id],
    ["/drafts", "POST", undefined],
  ]) {
    const response = await f.request(path!, {
      method, cookie: owner.cookie,
      body: method === "POST" || (method === "PUT" && path!.startsWith("/drafts")) ? { package: f.source } : undefined,
    });
    expect(response.status).toBe(method === "POST" ? 201 : 200);
    const { item } = await response.json() as { item: WorkshopItem };
    expect(metrics.mock.calls.map(([ids]) => ids)).toEqual([[id ?? item.id]]);
    expect(favorites.mock.calls.map(([ids]) => ids)).toEqual([[id ?? item.id]]);
    expect(metadataList).not.toHaveBeenCalled();
    expect(fileList).not.toHaveBeenCalled();
    metrics.mockClear(); favorites.mockClear();
  }
});

test("catalog aggregates only metadata-filtered candidates and preserves statistical pagination", async () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const draft = await f.create(owner.cookie, true, { difficulty: "hard" });
  const other = f.guest("Other");
  await f.create(other.cookie, true, { difficulty: "easy" });
  seedPlay(f, "first-story", 5);
  seedPlay(f, "unrelated-history", 1);
  f.workshop.favorite("first-story", owner.id, true);
  f.workshop.favorite("unrelated-history", owner.id, true);
  const metrics = spyOn(f.runs, "catalogMetrics");
  const favorites = spyOn(f.workshop, "favorites");
  for (const [query, ids] of [
    ["q=latest%20alpha&ratingMin=5&limit=1", ["first-story"]],
    ["view=favorites", ["first-story"]],
    ["view=mine", [draft.id]],
    ["difficulty=hard&author=Owner", [draft.id]],
    ["q=unmatched", []],
  ] as const) {
    await f.list(`/stories?${query}`, owner.cookie);
    expect(metrics.mock.calls.map(([candidates]) => candidates)).toEqual([ids]);
    expect(favorites.mock.calls.map(([candidates]) => candidates)).toEqual([ids]);
    metrics.mockClear(); favorites.mockClear();
  }
  expect([...f.runs.catalogMetrics(["first-story"]).keys()]).toEqual(["first-story"]);
  expect([...f.workshop.favorites(["first-story"], owner.id).keys()]).toEqual(["first-story"]);
});

test("scoped catalog aggregates handle more candidates than one SQLite batch", () => {
  const f = fixture();
  const owner = f.guest("Owner");
  const ids = Array.from({ length: 405 }, (_, index) => `batch-story-${index}`);
  for (const id of ids) {
    seedPlay(f, id, 4);
    f.workshop.favorite(id, owner.id, true);
  }
  seedPlay(f, "unrelated-history", 1);
  f.workshop.favorite("unrelated-history", owner.id, true);
  const metrics = f.runs.catalogMetrics(ids);
  const favorites = f.workshop.favorites(ids, owner.id);
  expect(metrics.size).toBe(405);
  expect(favorites.size).toBe(405);
  for (const id of [ids[0], ids[404]]) {
    expect(metrics.get(id)).toEqual({ playCount: 1, ratingCount: 1, averageRating: 4 });
    expect(favorites.get(id)).toEqual({ count: 1, selected: true });
  }
});

function seedPlay(f: ReturnType<typeof fixture>, storyId: string, rating?: number) {
  const id = crypto.randomUUID();
  f.runs.create({
    id, storyId, storyVersion: 1, currentSceneId: "resolution",
    startedAt: "2026-11-06T00:00:00.000Z", lastActiveAt: "2026-11-06T00:01:00.000Z",
    endedAt: "2026-11-06T00:01:00.000Z", outcome: "completed", foundEvidenceIds: [],
  });
  if (rating !== undefined) f.runs.rate(id, storyId, rating, "2026-11-06T00:01:00.000Z");
}

test("sorts and filters apply to the full catalog before stable pagination", async () => {
  const f = fixture();
  const owner = f.guest("Story Maker");
  const item = await f.create(owner.cookie, true, { difficulty: "hard" });
  seedPlay(f, "first-story", 5);
  seedPlay(f, "second-story", 2);
  seedPlay(f, "second-story");
  await f.request(`/stories/${item.id}/favorite`, { method: "PUT", cookie: owner.cookie });
  expect((await f.list("/stories?sort=rating")).items.map((entry) => entry.id)).toEqual(["first-story", "second-story", item.id]);
  expect((await f.list("/stories?sort=plays")).items[0].id).toBe("second-story");
  expect((await f.list("/stories?sort=favorites")).items[0].id).toBe(item.id);
  expect((await f.list("/stories?sort=latest")).items[0].id).toBe(item.id);
  expect((await f.list("/stories?ratingMin=5")).items.map((entry) => entry.id)).toEqual(["first-story"]);
  expect((await f.list("/stories?playsMin=2")).items.map((entry) => entry.id)).toEqual(["second-story"]);
  expect((await f.list("/stories?difficulty=hard&author=maker")).items.map((entry) => entry.id)).toEqual([item.id]);
  expect((await f.list("/stories?difficulty=unset")).total).toBe(2);
  expect((await f.list("/stories?q=latest%20alpha")).items.map((entry) => entry.id)).toEqual(["first-story"]);
  expect((await f.list("/stories?publishedAfter=2020-01-01")).items.map((entry) => entry.id)).toEqual([item.id]);
  expect((await f.list("/stories?publishedAfter=9999-01-01")).total).toBe(0);
  const page = await f.list("/stories?sort=plays&limit=1&offset=1");
  expect(page.total).toBe(3);
  expect(page.items[0].id).toBe("first-story");
  expect(page.offset).toBe(1);
  expect((await f.list("/stories?limit=1&offset=999")).items).toEqual([]);
});

test("invalid filters, unsafe metadata, malformed files and oversized writes fail", async () => {
  const f = fixture();
  for (const query of [
    "sort=nope", "view=other", "ratingMin=0", "ratingMin=6", "ratingMin=1.5", "ratingMin=NaN",
    "playsMin=-1", "playsMin=1e3", "favoritesMin=9007199254740992", "limit=0", "limit=101", "offset=-1",
    "difficulty=impossible", "mode=unknown", "locale=not-a-locale", "publishedAfter=2026-02-30",
    "publishedAfter=2026-13-01", "publishedAfter=tomorrow", `q=${"a".repeat(101)}`, `author=${"a".repeat(101)}`,
  ]) expect((await f.request(`/stories?${query}`)).status).toBe(400);
  const owner = f.guest("Owner");
  for (const extra of [
    { ownerId: "other" }, { author: { id: "other", name: "Other" } },
    { thumbnailUrl: "https://example.com/image.webp" }, { thumbnailUrl: "/images/unknown.webp" },
    { thumbnailUrl: "/images/story.svg" }, { thumbnailUrl: "javascript:alert(1)" }, { thumbnailUrl: "//evil.example/image" },
    { thumbnailUrl: "https://user:password@example.com/image" }, { thumbnailUrl: "data:image/svg+xml,test" },
    { difficulty: ["easy"] }, { published: "true" },
  ]) expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: f.source, ...extra } })).status).toBe(400);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, raw: "{" })).status).toBe(400);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: {} } })).status).toBe(422);
  expect((await f.request("/stories/validate", { method: "POST", body: f.source })).status).toBe(200);
  expect((await f.request("/stories/validate", { method: "POST", body: {} })).status).toBe(422);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, raw: " ".repeat(1024 * 1024 + 1) })).status).toBe(413);
});

test('private draft deletion is owner-only, rejects public stories, clears favorites and retries safely', async () => {
  const f = fixture();
  const owner = f.guest('Owner'), other = f.guest('Other');
  const draft = await f.create(owner.cookie);
  const published = await f.create(owner.cookie, true);
  const untouched = await f.create(other.cookie);
  f.workshop.favorite(draft.id, other.id, true);
  expect((await f.request(`/drafts/${draft.id}`, { method: 'DELETE' })).status).toBe(401);
  expect((await f.request(`/drafts/${draft.id}`, { method: 'DELETE', cookie: other.cookie })).status).toBe(404);
  expect((await f.request(`/drafts/${published.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(409);
  expect((await f.request(`/drafts/${draft.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(200);
  expect(f.workshop.source(draft.id, owner.id)).toBeUndefined();
  expect(f.workshop.favorites([draft.id], other.id).get(draft.id)?.count ?? 0).toBe(0);
  expect((await f.request(`/drafts/${draft.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(404);
  expect((await f.request(`/drafts/${draft.id}`, { cookie: owner.cookie })).status).toBe(404);
  expect((await f.request(`/stories/${draft.id}`, { cookie: owner.cookie })).status).toBe(404);
  expect((await f.request(`/drafts/${draft.id}`, { method: 'PUT', cookie: owner.cookie, body: { package: f.source } })).status).toBe(404);
  expect(f.workshop.source(untouched.id, other.id)).toBeDefined();
  expect(f.workshop.get(published.id)?.published).toBe(true);
});

test('deletion restores exact count/byte quotas and rolls back linked cleanup on failure', async () => {
  const f = fixture(source => ({ guestDrafts: 1, totalDrafts: 1, guestBytes: payloadBytes(source, 'Owner'), totalBytes: payloadBytes(source, 'Owner'), globalCreatesPerMinute: 100 }));
  const owner = f.guest('Owner');
  const draft = await f.create(owner.cookie);
  const create = () => f.request('/drafts', { method: 'POST', cookie: owner.cookie, body: { package: f.source } });
  expect((await create()).status).toBe(429);
  f.workshop.favorite(draft.id, owner.id, true);
  f.store.db.exec(`CREATE TRIGGER reject_draft_delete BEFORE DELETE ON workshop_drafts BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);
  expect(() => f.workshop.deletePrivate(draft.id, owner.id)).toThrow('simulated failure');
  expect(f.workshop.source(draft.id, owner.id)).toBeDefined();
  expect(f.workshop.favorites([draft.id], owner.id).get(draft.id)?.count).toBe(1);
  expect((await create()).status).toBe(429);
  f.store.db.exec('DROP TRIGGER reject_draft_delete');
  expect(f.workshop.deletePrivate(draft.id, owner.id)).toBe('deleted');
  expect((await create()).status).toBe(201);
});


test('only managed thumbnails are exposed; legacy external URLs remain stored without being rendered', async () => {
  const f = fixture();
  const owner = f.guest('Owner');
  const item = f.workshop.create(owner, { package: f.source, published: true, difficulty: null, thumbnailUrl: 'https://legacy.example/old.jpg' });
  expect((await f.list()).items.find(row => row.id === item.id)?.thumbnailUrl).toBeNull();
  expect(f.workshop.get(item.id)?.thumbnailUrl).toBe('https://legacy.example/old.jpg');
  const updated = await f.request(`/drafts/${item.id}`, {method:'PUT',cookie:owner.cookie,body:{package:f.source,published:true,thumbnailUrl:MANAGED_IMAGES.invitation}});
  expect(updated.status).toBe(200);
  expect((await f.list()).items.find(row => row.id === item.id)?.thumbnailUrl).toBe(MANAGED_IMAGES.invitation);
});


test('stored legacy share images remain visible without accepting legacy paths for new writes', async () => {
  const f = fixture();
  const owner = f.guest('작성자');
  for (const [legacy, current] of [
    ['/og/story-archive-ko-v2.webp', MANAGED_IMAGES.ogKo],
    ['/og/story-archive-en-v2.webp', MANAGED_IMAGES.ogEn],
  ]) {
    const item = f.workshop.create(owner, { package: f.source, published: true, difficulty: null, thumbnailUrl: legacy });
    expect((await f.list()).items.find(row => row.id === item.id)?.thumbnailUrl).toBe(current);
    expect(f.workshop.get(item.id)?.thumbnailUrl).toBe(legacy);
    const result = await f.request(`/drafts/${item.id}`, {method:'PUT', cookie:owner.cookie, body:{package:f.source, published:true, thumbnailUrl:legacy}});
    expect(result.status).toBe(400);
  }
});
