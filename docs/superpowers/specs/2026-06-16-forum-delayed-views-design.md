# Forum Delayed Views Design

Date: 2026-06-16

## Goal
A single forum post detail click should ultimately count as 10 views: 1 view immediately and 9 additional views appearing later in batches after roughly 1-25 minutes.

## Architecture
The existing frontend request stays unchanged: the post detail page calls `GET /api/forum/posts/:id?incrementView=1`. The backend records one immediate row in `forum_post_views`, then records nine additional rows with future `created_at` timestamps. All view-count SQL must only count rows whose `created_at` is not in the future, so delayed rows become visible naturally when users later refresh pages or lists.

## Components
- `server.js`: keep the forum detail endpoint behavior, change insert logic to create immediate and delayed rows, and make all `viewCount` subqueries filter by current timestamp.
- `forum-post-views.js`: isolate delayed-view SQL snippets and timestamp generation for direct tests.
- `tests/forum-post-views.test.js`: verify delayed batches total 10 rows and count SQL excludes future rows.

## Error Handling
If delayed insertion fails, the request should fail like the current single insert does, because view persistence is part of the endpoint's current behavior. Invalid post or permission behavior remains unchanged.

## Testing
Use Node's built-in test runner for the new helper module and a source-level guard that `server.js` uses the helper-generated count clause instead of raw `COUNT(*)` for forum views.

