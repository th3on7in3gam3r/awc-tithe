# Rules for AI agents (Cursor, Claude, ChatGPT, Grok)

This project's shared memory lives in **Agent Relay** (project slug: `awc-tithe`).

1. **Start:** call `get_project_context` for `awc-tithe` and follow its HANDOFF and decisions.
2. **Branch:** work on `<your-name>/<task>` (e.g. `cursor/building-fund`), never `main`. Claude reviews and merges to `main`.
3. **Check:** run the tests and build before you push:
   `BETTER_AUTH_SECRET=test-only-secret npm test && npm run lint && npm run build`
4. **Decisions:** save decisions the user states with `save_fact` (project `awc-tithe`).
5. **Stop:** before you stop, call `save_session` (what you did, what you skipped, what's next, branch and commits) and `update_handoff` if the checklist changed.
6. Always pass your own name as `agent` (e.g. "Cursor").

## Project rules that must not break
- Never mark a gift completed on link click; verify by webhook, otherwise Finance reconciles by hand.
- Every gift is tracked in AWC DCB.
- Cash App is paused on purpose (`CASHAPP_PAUSED`). Don't remove the Cash App code.
- Many givers are elderly: big, obvious buttons and plain words.
