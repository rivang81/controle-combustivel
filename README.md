# ⛽ Fuel Tracker

**Live app:** https://rivang81.github.io/controle-combustivel/

An offline-first PWA for logging fill-ups and answering the question every Brazilian flex-fuel driver asks at the pump: **should I fill up with ethanol or gasoline today?**

Built to run on an aftermarket Android car head unit (multimídia) — big touch targets, dark theme, voice input, and zero dependence on an internet connection inside the car. No backend, no login, no app store: all data stays on the device.

## What it does

- **Fill-up log** using the full-tank method: fill the tank, reset the trip meter, and at the next fill-up enter the trip km and the liters that fit. That ratio is your real fuel economy for the interval — no guesswork.
- **Ethanol × gasoline verdict, personalized.** The classic "70% rule" is a market average. This app measures *your car's* actual ethanol-to-gasoline efficiency ratio from your own history and compares it against today's pump prices. It also shows the ethanol break-even price. Until there's enough data, it falls back to a configurable initial estimate (default 0.68).
- **Savings tracking.** Optionally record the other fuel's price at the same pump and the app tells you how much you saved (or overspent) by your choice — per tank, in the history, and accumulated.
- **Pump voice command.** Tap the dictation field and say *"gas 5.89 ethanol 3.99"* — the app fills in both prices, picks the winning fuel, and **speaks back** the estimated savings on a full tank (reference tank size is configurable, default 45 L). Then dictate *"412 km, 38.5 liters"* to complete the record. Speech-to-text comes from the keyboard mic (works offline with the downloaded language pack); the parsing and the spoken reply are the app's own and work offline too.
- **GPS speedometer** as the start screen: a full-screen speed display (GPS works without internet), with Wake Lock so the screen stays on while driving.
- **Mascots** 🦄✈️🐦🐉 — side decorations for the copilot: unicorn with rainbow, planes, a little bird, or a dragon walking among spinning windmills. Or none, if you're boring.
- **Settings:** English/Portuguese, US units (miles, gallons, mpg, mph) or Brazilian units (km, liters, km/l), voice replies on/off, tank size, and the initial ethanol efficiency estimate. Prices are always in R$.

## How the verdict works

```
efficiencyRatio = avgEthanol(km/l) / avgGasoline(km/l)   // measured from your history
priceRatio      = ethanolPrice / gasolinePrice

priceRatio < efficiencyRatio → ETHANOL pays off
priceRatio > efficiencyRatio → GASOLINE pays off

ethanolBreakEven = gasolinePrice × efficiencyRatio
```

What matters isn't the price per liter — it's the **cost per km**. The first record is only a baseline (no valid consumption interval) and is excluded from all averages.

## Installing on a car head unit (or any phone)

1. Give the head unit internet once (phone hotspot works).
2. Open the URL above in the browser.
3. Browser menu → **"Install app"** / **"Add to Home screen"**.
4. Done. The service worker caches everything — from then on the app runs fullscreen and fully offline.

## Tech

Plain HTML + CSS + JavaScript. No frameworks, no build step, no dependencies.

- `app.js` — storage (localStorage), calculations, rendering, settings/i18n, GPS speedometer
- `voz.js` — pure-text parser that turns a dictated utterance (numbers as digits or Portuguese words, "e meio", two-part prices like "cinco e oitenta e nove") into form fields
- `sw.js` + `manifest.json` — installable, offline-first PWA
- Data is stored internally in km / liters / R$-per-liter regardless of display units

To run locally: open `index.html`, or `python3 -m http.server` for the full PWA experience.

## Privacy

There is no server. Fill-up records, settings, and GPS readings never leave the device.

---

Made with the help of [Claude Code](https://claude.com/claude-code) — and a daughter who likes rainbows and unicorns. 🌈
