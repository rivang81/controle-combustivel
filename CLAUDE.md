# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Phase 1 MVP implemented as a static page — `index.html` + `style.css` + `app.js` + `voz.js`, source-authored with modern JS syntax (optional chaining, nullish coalescing, optional catch binding), transpiled before deploy (see Build below). `voz.js` is a pure-text parser (`interpretarDitado`) that turns a dictated pt-BR utterance (transcribed by the keyboard's mic) into form fields — fuel, km, liters, price — handling decimal comma, number words ("trinta e oito vírgula cinco"), "e meio", and two-part prices ("cinco e oitenta e nove"). `controle-de-combustivel.md` is the full project specification (in Portuguese) and the source of truth for requirements, data model, calculation logic, and roadmap.

**Run:** open `index.html` directly, or `python3 -m http.server 8000` and browse to `http://localhost:8000`. Syntax check: `node --check app.js`. Calculation logic lives in pure functions at the top of `app.js` (`calcularEstatisticas`, `comIntervalos`) and can be tested in Node by stubbing `localStorage`.

**Build (required before every deploy):** the head unit's WebView is often Android 6/7/8 stock Chrome (pre-Chrome 80) — it doesn't understand `?.`/`??`/optional catch binding, and when it hits unknown syntax it silently discards the whole `.js` file, so no `addEventListener` ever registers and every button appears dead even though HTML/CSS render fine. `index.html` therefore loads `app.min.js`/`voz.min.js`, not the source files. Run `npm install` once, then `npm run build` to regenerate them via esbuild (`target: es2015`, one file at a time, no bundling/no format wrapper — `voz.js` and `app.js` share the global scope by design, since `app.js` calls `voz.js`'s `interpretarDitado` as a global; bundling them under `--format=iife`/`esm` would break that). Always edit `app.js`/`voz.js` (the source), never the generated `.min.js` files.

**Deploy:** the app is a PWA (`manifest.json`, `sw.js`, `icone-*.png`) published via GitHub Pages at **https://rivang81.github.io/controle-combustivel/** (repo `rivang81/controle-combustivel`, branch `main`, legacy Pages build). To ship changes: run `npm run build`, commit source + regenerated `.min.js`, `git push`, wait ~1 min. **Bump the `CACHE` version in `sw.js` on every deploy** — the service worker is cache-first, so installed clients keep old assets until the cache name changes. The SW only registers over http(s), never `file://`.

## What this is

"Controle de Combustível" — a fuel-tracking app for a single personal car, used on an aftermarket Android head unit (multimídia). The user logs each fill-up (fuel type, trip km, liters, optional price/liter) and the app shows real km/l per fuel, cost per km, and a verdict on whether ethanol or gasoline is cheaper **for this specific car**.

## Architecture decisions (from the spec)

- **Offline-first PWA** targeting the head unit's browser — no backend, no login, no remote database. Everything is local. Optionally packageable as an APK later (WebView/Capacitor) from the same codebase.
- **Frontend:** plain HTML+JS or static React — keep it lightweight.
- **Storage:** IndexedDB (preferred) or localStorage. Single collection `abastecimentos`; see the `Abastecimento` type in the spec (§4). Derived values (km/l, cost/km, total cost) are computed, never stored.
- **Backup:** CSV/JSON export/import is planned (Phase 2) since head units can be factory-reset.

## Settings, i18n and units

A ⚙️ button (fixed, visible on both screens) opens settings, persisted in localStorage key `config`: language (pt/en, **default en**), units (br/us, **default us** — user's explicit choice), mascot (`unicornio`/`avioes`/`passarinho`/`dragao`/`nenhum`), voice replies on/off (`voz`, gates all `falar()` speech output — text feedback always stays), tank size (default 45 L) and initial ethanol efficiency (default **0.68**). Key invariants:

- **Storage is always km / liters / R$-per-liter.** US units (miles, gallons, mpg, mph) exist only at the display/input boundary — `distExib/distInterna`, `volExib/volInterno`, `precoExib/precoInterno`, `consumoExib`, `custoDistExib` in `app.js`. Never store converted values.
- All UI strings go through `t(key, ...args)` backed by the `T` dictionary (pt/en); several entries are functions because they depend on the unit system. Static HTML elements have ids that `aplicarTextos()` fills — new UI text must be added to both languages and wired there.
- Mascots are SVG pairs in `index.html` with classes `m-<name>`; visibility is CSS-driven via `body[data-mascote=...]` (≥1000px only). The windmill blades use SMIL `animateTransform`.
- URL param overrides for testing (not persisted): `?mascote=dragao&idioma=en&unidades=us`.
- `interpretarDitado(texto, {sistema})` needs the unit system to pick plausibility ranges (price per gallon in R$ can be ~22, which would be rejected by the per-liter cap).

## Domain logic (critical to get right)

- **Full-tank method (§3.2):** the user fills the tank and resets the trip. At the next fill-up, `kmRodados / litros` is the consumption of the interval that *ends* at the current record. The **first record is only a baseline** — it has no valid consumption interval and must be excluded from all averages.
- **Per-fill savings (§5.4):** the optional `precoOutro` field stores the other fuel's pump price at the same fill-up. Savings = what the same km would have cost on the other fuel (liters adjusted by the efficiency ratio) minus what was paid. `precoOutro` also feeds the verdict's latest-price lookup, so both prices can come from the same pump visit.
- **Ethanol vs. gasoline verdict (§5.3):** compare `precoEtanol/precoGasolina` against the car's measured `mediaEtanol/mediaGasolina`. If price ratio < efficiency ratio, ethanol wins. Until there's enough data for both fuels, fall back to **0.68** (user's chosen initial estimate — not the common 0.70) and tell the user the estimate improves with more records. Also show the ethanol break-even price: `precoGasolina * rendimentoRelativo`.
- **Pump-price voice command (§5.5):** dictating both prices at once ("gasolina 5,89 etanol 3,99") fills both price fields, auto-selects the winning fuel, and speaks (SpeechSynthesis, language from settings) the estimated savings on a reference tank (`config.tanqueLitros`, default 45 L); the user then dictates km/liters into the same accumulating field. The announcement is keyed on the price pair so re-parses don't repeat it.
- Locale is Brazilian: prices in R$, decimal comma in user input (e.g. "38,5" liters), UI text in Portuguese.

## UX constraints (car environment, §7)

- Large touch targets, single-screen logging flow, fuel type as two big buttons.
- Numeric keyboards on number fields; date/time auto-filled (adjustable but not by default).
- Must work 100% offline; clear visual confirmation on save; dark theme by default.
- **Speedometer mode is the start screen** — the app opens on the full-screen GPS speed display; the "⛽ Abastecer" button switches to the logging form and `#abastecimento` in the URL skips straight to it. The side decorations (rainbow/unicorn SVGs, `z-index` above the overlay) stay visible in both screens. Uses `watchPosition` (`coords.speed`, falling back to haversine between fixes), Wake Lock to keep the screen on, and fullscreen. GPS works offline but only while the page is foregrounded. Distance tracking / GPS odometer was considered and deliberately not built — the car's trip meter is the source of truth for km.

## Roadmap order (§8)

1. **MVP:** logging form, local storage, per-fuel averages + verdict, history list.
2. PWA install/service worker, export/import, edit/delete records.
3. Charts, cost per km, monthly spend, break-even price highlighted.
4. Voice input, Drive/Sheets sync, consumption-drop alerts.

Out of scope: multiple vehicles, multi-user/login, OBD-II integration, app-store publishing.
