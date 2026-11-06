# API reference

API endpoints live under product modules. Lobby APIs require the `festival_guest` HttpOnly cookie. Workshop story browsing is public. Same-origin browser requests include the cookie automatically.

## Lobby story catalog

### `GET /api/lobby/stories`

Authenticated paginated catalog for the room story picker.

#### Query parameters

| Parameter | Type | Allowed values / range | Default | Description |
| --- | --- | --- | --- | --- |
| `q` | string | Up to 100 characters | — | Case-insensitive title and subtitle search. |
| `origin` | string | `original`, `demo` | — | Filter by the story's configured origin. |
| `difficulty` | string | `easy`, `normal`, `hard`, `unset` | — | Filter by difficulty. `unset` selects stories whose difficulty is `null`. |
| `players` | integer | 1–20 | — | Exact player count supported by the story. |
| `sort` | string | `latest`, `rating`, `popular` | `latest` | Sort by version, average rating, or distinct completed players. |
| `limit` | integer | 1–100 | 12 | Maximum items to return. |
| `offset` | integer | 0–1,000,000 | 0 | Number of filtered items to skip. |

#### Response

```json
{
  "items": [
    {
      "id": "rehearsal",
      "version": 1,
      "title": "사라진 축제 초대장",
      "subtitle": "연결과 게임 진행을 확인하는 2인용 테스트 시나리오",
      "players": 2,
      "minutes": 5,
      "available": true,
      "kind": "demo",
      "origin": "demo",
      "difficulty": null,
      "averageRating": null,
      "ratingCount": 0,
      "startedPlays": 0,
      "completedPlays": 0,
      "uniquePlayers": 0
    }
  ],
  "total": 1,
  "limit": 12,
  "offset": 0
}
```

- `uniquePlayers` counts distinct participant IDs in completed lobby sessions. `startedPlays` and `completedPlays` are session counts.
- `averageRating` is `null` and `ratingCount` is zero: lobby stories do not currently collect ratings. Rating sort places unrated items last, then uses story version.
- `difficulty` is `null` until configured. Use `difficulty=unset` to query items that have no difficulty.
- `latest` uses descending story version because lobby stories do not store a publication timestamp.
- `origin` is derived from the existing `kind` metadata (`original` or `demo`).

#### Errors

| Status | Meaning |
| --- | --- |
| 200 | Catalog returned; no matches produce an empty `items` array. |
| 400 | Invalid query parameter. |
| 401 | Missing or expired guest login. |

#### Example

```sh
curl -b cookies.txt 'https://example.com/api/lobby/stories?q=축제&origin=original&players=4&sort=popular&limit=6&offset=0'
```

## Workshop story catalog

### `GET /api/workshop/stories`

Public metadata catalog for versioned `.mstory` packages. This catalog is separate from lobby scenarios.

| Parameter | Type | Allowed values / range | Default | Description |
| --- | --- | --- | --- | --- |
| `q` | string | Up to 100 characters | — | Search title and subtitle. |
| `mode` | string | `solo`, `multiplayer` | — | Filter by game mode. |
| `locale` | string | BCP 47 short locale, e.g. `ko`, `en-US` | — | Filter by story locale. |
| `limit` | integer | 1–100 | 24 | Maximum items to return. |
| `offset` | integer | 0–1,000,000 | 0 | Number of filtered items to skip. |

Returns `items`, `total`, `limit`, and `offset`. Each item has `id`, `version`, `mode`, `locale`, `title`, `subtitle`, `playerCount` (`min`/`max`), and `estimatedMinutes`.

### Other story and play endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/workshop/stories/:id` | Read one public story package's metadata. |
| `POST /api/workshop/stories/validate` | Validate a draft package; does not save or publish it. |
| `GET /api/game/stories/:id` | Load playable solo story content with private solution content removed. |
| `POST /api/game/sessions` | Start a solo session. JSON body: `{"storyId":"..."}`. |
| `POST /api/game/sessions/:id/advance` | Advance the current solo story scene. |
| `POST /api/game/sessions/:id/evidence` | Inspect evidence. JSON body: `{"evidenceId":"..."}`. |
| `POST /api/game/sessions/:id/accuse` | Submit a suspect and evidence IDs. |
| `POST /api/game/sessions/:id/abandon` | Mark a solo session abandoned. |
| `POST /api/game/sessions/:id/rating` | Submit an integer rating from 1 to 5 after a completed solo session. JSON body: `{"rating":5}`. |
| `GET /api/platform/admin/stories/:id/metrics` | Read story analytics with `Authorization: Bearer <STORY_ADMIN_TOKEN>`. |

The frontend's room picker uses `/api/lobby/stories`; the Workshop page uses `/api/workshop/stories`. Do not substitute one endpoint for the other: they serve different story catalogs and return different item shapes.
