# Like State Loss Investigation

## Symptom
- After liking a post in the index feed, revisiting the page minutes later shows the like missing even though the backend kept the vote.

## Reproduction
- Like a post on the home feed.
- Leave the page (e.g., switch tab) and return within five minutes, before cache expiry.
- The UI reloads the cached feed and the post appears unliked.

## Findings
- getIndexData restores the post list from the cached entry index_postList_cache when available (miniprogram/pages/index/index.js:75-88).
- The cache is only populated during the initial fetch inside getPostList (miniprogram/pages/index/index.js:440-518, cache write at miniprogram/pages/index/index.js:501).
- Subsequent like/unlike actions mutate 	his.data.postList but never refresh that cached copy (miniprogram/pages/index/index.js:274-319).
- Cached entries live for five minutes by default (miniprogram/utils/dataCache.js:4-42), so returning before expiry replays stale state.

## Impact
- Users see their likes "disappear" whenever the feed reloads from cache, even though the ote cloud function persisted the action (cloudfunctions/vote/index.js:13-69).

## Suggested Next Steps
1. Invalidate or refresh index_postList_cache whenever a vote succeeds.
2. Alternatively, skip using cached data once a post's like state changes locally.