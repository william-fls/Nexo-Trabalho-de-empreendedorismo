# AGENTS.md — Nexo (Marketplace B2B)

Static site, no build. No `package.json`, no tests, no lint, no CI.

## Run
- `python -m http.server 8000` in repo root, open `http://localhost:8000` — or just open `index.html` directly.
- No install step. Google Fonts needs internet; rest works offline.

## Structure (all that matters)
- `index.html` — all views (public `#publicZone` + app shell `#appZone` + modal). Script order matters: `js/store.js` then `js/app.js`.
- `js/store.js` — defines `window.NexoStore` (`load/save/reset`, `uid`, `dayPlus`), seed data, `localStorage` key `nexo_db_v1` (`v:6`; `load()` migrates `v:1–v:5` bases, backfills storefront/shop fields, product `cat`, `menuCats`, missing demo shops, `cart` and `orders`).
- `js/app.js` — hash router (`parseHash`/`route`), public rendering, panel views, `window.Nexo.*` actions.
- `css/style.css` — single stylesheet. `assets/` is empty.

## Rules that will bite you
- **Never touch `localStorage` outside `js/store.js`.** In `app.js` / new code use `db` in memory + `save()` (`NexoStore.save(db)`). Reset demo: `localStorage.removeItem('nexo_db_v1'); location.reload();`
- **Dynamic HTML uses inline `onclick="Nexo.*"`** (e.g. `svcCard`, `proCard`, tables). Keep exposing actions on `window.Nexo`; `addEventListener` won't survive re-renders.
- **Always `esc()` user-derived strings** when interpolating into HTML. Use existing helpers: `esc()`, `norm()` (accent-insensitive search), `BRL()`, `fdate()`/`fdateFull()`, `initials()`.
- **After any mutation call `save()` then re-render** (`refresh()` / `vReqDetail()` / `vMsgs()`) plus `paintChrome()` / `paintSide()` for badges/sidebar.
- **Status machine is fixed** (`STATUS` in `app.js`): `solicitado → recebendo_propostas → proposta_aceita → agendado → em_andamento → concluido → avaliado`. Don't invent statuses; `accept()` auto-creates a `schedule` + `conv`, `agStatus()` syncs `schedule.status` → `request.status`.
- **Role gates:** `isEmp()` (empresa) vs `isProv()` (prestadora/autonomo/loja). `isLabor()` (só prestadora/autonomo — quem NÃO contrata). `isLoja()` (vitrine + catálogo). Loja contrata e propõe; only labor cannot `openRequest`/`accept`; only prestador+loja can `bid`. Cart (`db.cart`, one shop) + simulated `window.NexoPay` checkout → `db.orders`; real charging needs a backend gateway.
- Auth is `db.session = userId`; all demo passwords are `demo1234` (`empresa@demo.com`, `carlos@demo.com`, `eletrosul@demo.com`).
- UI language is PT-BR. Router is hash-based (`#/buscar`, `#/app/<view>`); public views toggled by `showView()`, app by `renderApp()`.

## Verify
- No automated checks. Verify by loading the page, logging in with a demo account, and exercising the touched flow (search → request → proposal → schedule → evaluate). Check DevTools console for errors.
