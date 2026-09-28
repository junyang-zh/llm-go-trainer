# Project conventions

- Keep Go legality and scoring in `shared/`; do not duplicate rules in the UI.
- All KataGo numbers use Black's perspective. Document and test any conversion.
- Chinese rules here map to `chinese-ogs` (positional superko), including handicap bonus N. Japanese final scoring is not implemented.
- Never substitute mock evaluations for engine output in the app. Test fixtures belong in `tests/fixtures/` only.
- Keep credentials server-side. Spawn local tools with parameter arrays, no shell interpolation. Never commit `.env`, binaries, models, private SGFs or CLI output.
- Runtime coach instructions live in `prompts/coach.zh-CN.md`; reusable skill points to that source. Do not claim unverified tactics or measured playing strength.
- Before delivering logic changes, run `npm test` and `npm run build`. Integration tests need loopback networking; no actual LLM key is required.
- Prefer Electron (`npm run desktop`) for UI and end-to-end testing. Use browser mode for supplementary Web debugging; it does not replace desktop validation.
- Report validation results, hardware and providers tested, and remaining gaps in the conversation. Keep session reports and validation logs out of the repository.
