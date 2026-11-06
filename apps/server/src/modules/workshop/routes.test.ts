import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { storyPackageSchema, type StoryPackage } from "@festival/shared";
import { Store } from "../../store";
import { SQLiteStoryRunStore } from "../../infrastructure/sqlite/story-run-store";
import { SQLiteWorkshopStore } from "../../infrastructure/sqlite/workshop-store";
import { FileStoryCatalog } from "../platform/stories/file-catalog";
import { createWorkshopRoutes } from "./routes";
import type { WorkshopItem } from "./model";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function fixture() {
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
  const store = new Store(":memory:");
  const runs = new SQLiteStoryRunStore(store.db);
  const workshop = new SQLiteWorkshopStore(store.db);
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
  return { source, store, runs, workshop, guest, request, create, list };
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
  const item = await f.create(owner.cookie, false, { difficulty: "hard", thumbnailUrl: "/images/story.svg" });
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
  expect(new SQLiteWorkshopStore(f.store.db).favorites(other.id).get("first-story")).toEqual({ count: 1, selected: true });
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
    { thumbnailUrl: "javascript:alert(1)" }, { thumbnailUrl: "//evil.example/image" },
    { thumbnailUrl: "https://user:password@example.com/image" }, { thumbnailUrl: "data:image/svg+xml,test" },
    { difficulty: ["easy"] }, { published: "true" },
  ]) expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: f.source, ...extra } })).status).toBe(400);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, raw: "{" })).status).toBe(400);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, body: { package: {} } })).status).toBe(422);
  expect((await f.request("/stories/validate", { method: "POST", body: f.source })).status).toBe(200);
  expect((await f.request("/stories/validate", { method: "POST", body: {} })).status).toBe(422);
  expect((await f.request("/drafts", { method: "POST", cookie: owner.cookie, raw: " ".repeat(1024 * 1024 + 1) })).status).toBe(413);
});
