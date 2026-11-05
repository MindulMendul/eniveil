# API reference

All API requests use the same origin as the web app. Except for `POST /api/guest` and `GET /api/health`, endpoints require the `festival_guest` HttpOnly cookie. The browser sends it automatically for same-origin `fetch` requests.

## Story catalog

### `GET /api/stories`

Returns a filterable, sorted, paginated catalog for the story picker.

#### Query parameters

| Parameter | Type | Allowed values / range | Default | Description |
| --- | --- | --- | --- | --- |
| `search` | string | Up to 100 characters | — | Case-insensitive substring match against title and subtitle. |
| `origin` | string | `original`, `demo` | — | Filter by original story or demo. |
| `difficulty` | string | `easy`, `normal`, `hard`, `unset` | — | Filter by difficulty. Use `unset` for stories whose difficulty is `null`. |
| `players` | integer | 1–20 | — | Exact supported player count. |
| `sort` | string | `latest`, `rating`, `popular` | `latest` | Sort order described below. |
| `page` | integer | 1–100000 | 1 | 1-based page number. |
| `limit` | integer | 1–50 | 12 | Items per page. |

#### Sort behavior

- `latest`: descending story version. The catalog does not store a publish timestamp yet, so version is the current recency signal.
- `rating`: average rating descending, unrated stories last. Ratings are not collected yet, so current entries have no average and ties fall back to version.
- `popular`: distinct players from completed sessions descending, then completed play count, then version.

#### Response

Example response for `?origin=demo`:

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
      "completedPlays": 0,
      "uniquePlayers": 0
    }
  ],
  "page": 1,
  "limit": 12,
  "total": 1,
  "pages": 1
}
```

- `uniquePlayers` counts distinct participant IDs across completed sessions for that story. It does not count in-progress or abandoned sessions.
- `completedPlays` counts sessions returned from the reveal phase to the room.
- `averageRating` is `null` and `ratingCount` is zero until rating collection is implemented. The UI displays this as “Not rated”/“평가 없음”; it never invents a score.
- `difficulty` is `null` until a story author sets it.
- `kind` is retained for existing clients; `origin` is the catalog filter field.

#### Errors

| Status | Meaning |
| --- | --- |
| 200 | Catalog returned. An empty `items` array means no results match. |
| 400 | Invalid query parameter. The body contains an `error` message. |
| 401 | Missing or expired guest login. |

#### Examples

```sh
curl -b cookies.txt 'https://example.com/api/stories?origin=original&players=4&sort=latest&page=1&limit=12'
curl -b cookies.txt 'https://example.com/api/stories?search=%EC%B6%95%EC%A0%9C&sort=popular'
```

The same endpoint is used by the authenticated room story picker. Filter controls update query parameters and page navigation requests the next result page.
