# AGENTS.md — Nexo (Marketplace B2B)

Static site, no build. No `package.json`, no tests, no lint, no CI.

## Run
- `python -m http.server 8000` in repo root, open `http://localhost:8000` — or just open `index.html` directly.
- No install step. Google Fonts needs internet; rest works offline.

## Structure (all that matters)
- `index.html` — all views (public `#publicZone` + app shell `#appZone` + modal). Script order matters: `js/store.js` then `js/app.js`.
- `js/store.js` — defines `window.NexoStore` (`load/save/reset`, `uid`, `dayPlus`, `readPhoto`), seed data, `localStorage` key `nexo_db_v1` (`v:15`; `load()` migrates `v:1–v:14` bases, backfills storefront/shop fields, product `cat` (restoring seed cats when missing or `Geral`), `menuCats`, missing demo shops, the demo pessoa-física account, `request.prestId` (null = legacy open request), owner photos (`user.capaFoto/logoFoto`, `product.foto` — null = gradient/initials fallback), seed demo photos (Unsplash hotlinks, verified; filled only where null so owner uploads win), `cart`/`orders`, default `disponibilidade`, and renames the city to fictional Vila Aurora). Owner upload goes through `NexoStore.readPhoto(file, maxDim)` (canvas-compressed JPEG data-URL, rejects non-image/>5MB) — never store raw files.
- `js/app.js` — hash router (`parseHash`/`route`), public rendering, panel views, `window.Nexo.*` actions.
- `css/style.css` — single stylesheet. `assets/` is empty.

## Rules that will bite you
- **Never touch `localStorage` outside `js/store.js`.** In `app.js` / new code use `db` in memory + `save()` (`NexoStore.save(db)`). Reset demo: `localStorage.removeItem('nexo_db_v1'); location.reload();`
- **Dynamic HTML uses inline `onclick="Nexo.*"`** (e.g. `svcCard`, `proCard`, tables). Keep exposing actions on `window.Nexo`; `addEventListener` won't survive re-renders.
- **Always `esc()` user-derived strings** when interpolating into HTML. Use existing helpers: `esc()`, `norm()` (accent-insensitive search), `BRL()`, `fdate()`/`fdateFull()`, `initials()`.
- **After any mutation call `save()` then re-render** (`refresh()` / `vReqDetail()` / `vMsgs()`) plus `paintChrome()` / `paintSide()` for badges/sidebar.
- **Status machine is fixed** (`STATUS` in `app.js`): `solicitado → recebendo_propostas → proposta_aceita → agendado → em_andamento → concluido → avaliado`. Don't invent statuses; `accept()` auto-creates a `schedule` + `conv`, `agStatus()` syncs `schedule.status` → `request.status`.
- **Role gates:** `isEmp()` (empresa) vs `isProv()` (prestadora/autonomo/loja). `isCliente()` (pessoa física — contrata como empresa, sem vitrine). `canContract()` = empresa/loja/cliente. `isLabor()` (só prestadora/autonomo — quem NÃO contrata). `isLoja()` (vitrine + catálogo). New-request flow is directed only: `Nexo.askService()` (client/empresa/loja → specific provider, `request.prestId` set, `solicitado` = awaiting confirmation) → `Nexo.confirmReq()` (provider only, creates `schedule` + `conv`, `agendado`) / `Nexo.refuseReq()` (provider only, deletes the request — no refused status exists). No open/broadcast creation UI remains (no `#/app/nova` route). `bid()` requires `isProv()` on legacy open requests (`!req.prestId`); `accept()`/`refuse()` require ownership (`req.empresaId === me().id`). Sidebar has Favoritos for all roles (badge = count); topbar `#topAsk` hidden for labor via `paintChrome()`. Login has no role picker (`doLogin` matches email+pass only). Providers register what they do in `#/app/servicos` (`Nexo.svcAdd/svcEdit/svcDel`, labor only; unlink removes, orphan service is deleted). `vReqList(false)` (oportunidades) redirects non-providers to solicitacoes; perfil próprio mostra "Editar meu perfil" em vez de Solicitar/Conversar. Quick account switch (demo): `Nexo.switchAccount()` toggles pessoa física (`u_cli_maria`) ⇄ empresa (`u_emp_prisma`) via `db.session` + `save()`. Cart (`db.cart` items with `lojaId`, multi-shop grouped) + simulated `window.NexoPay.checkoutMulti` → one `db.orders` entry per shop; real charging needs a backend gateway.
- Auth is `db.session = userId`; all demo passwords are `demo1234` (`cliente@demo.com`, `empresa@demo.com`, `carlos@demo.com`, `eletrosul@demo.com`).
- UI language is PT-BR. Router is hash-based (`#/explorar`, `#/app/<view>`, `#/carrinho`); `#/buscar` and `#/profissionais` redirect to `#/explorar`. Fictional demo city: Vila Aurora. Public views toggled by `showView()`, app by `renderApp()`.

## Verify
- No automated checks. Verify by loading the page, logging in with a demo account, and exercising the touched flow (search → request → proposal → schedule → evaluate). Check DevTools console for errors. Check 360/390/768px widths with the device toolbar (no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`).
