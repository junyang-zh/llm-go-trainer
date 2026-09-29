# Interactive coaching and trial branches

[English](coach-links.md) · [简体中文](../coach-links.md) · [繁體中文](../zh-TW/coach-links.md) · [日本語](../ja/coach-links.md) · [한국어](../ko/coach-links.md)

Coordinate extensions use standard Markdown fragment links in paragraphs, lists, tables, quotes and reference-style links. Code blocks/inline code stay literal. No HTML or `---#block…` delimiters are used. Web links remain external; unknown fragments become plain text.

| Purpose                  | Example                                                 |
| ------------------------ | ------------------------------------------------------- |
| Ungrouped point          | `[Crawl on the second line](#C2)`                       |
| Grouped point            | `[Atari](#go/point/B3?group=one)`                       |
| Exclusive selector       | `[Show variation](#go/selector/one)`                    |
| Trial starting position  | `[Variation one](#go/selector/one?branch=line-a&ply=0)` |
| After trial move two     | `[Continuation](#go/selector/two?branch=line-a&ply=2)`  |
| After main-line move ten | `[Review](#go/selector/review?turn=10)`                 |

Group/branch IDs use 1–40 ASCII letters, digits, `_` or `-`, scoped to one answer. Only one group is active across the UI; clicking its selector again disables it. Ungrouped points are independent. `branch` and `turn` are mutually exclusive; `ply` requires `branch`, defaulting to 0. `turn=0` means the original initial position. Coordinates use GTP (skip I); out-of-board points do not highlight and empty labels display the coordinate.

Only visible Agent text generates markers, and the board must match the message/selector's position. Tool records, user questions and collapsed panels do not. Proximity to either text or board point increases highlight intensity. Hovering either end or keyboard-focusing text displays a translucent dashed Bézier link from the board marker's upper-right edge to the visible label's upper-left corner; control points extend horizontally right/left. Repeated coordinates share a board marker; the closest visible label determines intensity/link.

## Agent trial editing

`edit_trial` validates the entire sequence server-side through `shared/`, then saves it in the current answer's `trials` via tool events and persists it with the conversation. Failures preserve existing branches. Creating a branch neither navigates the board nor changes the played game. Users open it through a selector, then navigate with the timeline, continue manually or save a new game. Closing a selector hides highlights but preserves board position.

```json
{"id":"line-a","base":"current","moves":["C2","B2"]}
{"id":"line-b","base":"branch","source":"line-a","ply":1,"moves":["B3"]}
```

- `base=current`: start at the user's current position, including visible user trials.
- `base=main` with `turn`: start after a move in the original game.
- `base=branch` with `source`: start from a branch created this round. `ply` keeps that many moves; `moves` replaces the remainder. Omit `ply` to append. The same `id` edits the branch, a new `id` creates another variation; `moves=[]` truncates.
- `operation=delete` with `id`: delete this round's branch; old selectors report that it no longer exists.

For cross-round editing, first select an existing branch and move number, then ask; the next round continues through `current`. `source` only resolves this round's branches, never implicitly searches other conversations. Branch records store their initial board and original-game origin to restore user trial prefixes; navigation is rejected if the original game no longer matches.

Legal moves are not necessarily engine recommendations. Tactical claims still require real board/engine evidence. The sole runtime coaching contract is [prompts/coach.zh-CN.md](../../prompts/coach.zh-CN.md).
