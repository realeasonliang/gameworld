# 🌍 GameWorld

> A collection of browser games hand-built by an elementary school student.

[🇨🇳 中文版 / Chinese version →](README.md)

---

## 👦 About Me

Hi! I'm **Eason Liang**, from **Shanghai, China**. I'm about to start **5th grade** in elementary school.

I love playing games — but even more, I love building my own. Everything in this repo is a **single-file HTML game** I made: no install, no server, just open the `*.html` file in any browser and play. If one of these games makes you smile, that's the best reward for me. Feel free to say hi!

---

## 🎮 Games

| Game | Type | Description |
|------|------|-------------|
| 🌍 `games/minecraft/minecraft.html` | 3D Sandbox | First-person block world: dig & build freely, infinite procedural terrain, wandering animals. |
| 🧟 `games/pvz/pvz.html` | 2D Tower Defense | A Plants vs. Zombies clone with built-in math / English quiz challenges. |
| 🚀 `games/sfs/sfs.html` | Space Sim | An SFS-style space flight simulator: build rockets, stage, dock with a station, travel between worlds. |

---

## 🕹️ How to Play

1. Clone or download this repo.
2. Open any `.html` file in your browser.
3. On-screen controls are shown inside each game.

```bash
git clone git@github.com:realeasonliang/gameworld.git
```

---

## 🏷️ Versioning

Format: **`major.minor.patch`** (e.g. `v2.0.0`) — the worldwide [Semantic Versioning](https://semver.org/) rule.

| Digit | Bump it when | Real example |
|-------|--------------|--------------|
| Major | A **brand-new game mode** lands | Block World adds Survival / Creative → `1.x.x` → `2.0.0` |
| Minor | **New content**, same gameplay | Space Flight Sim adds autopilot → `1.2.0` → `1.3.0` |
| Patch | Bug fixes, text tweaks, balance | Fixed a crash → `1.0.0` → `1.0.1` |

The site has one overall version, and each game has its own (they update at different speeds). Current:

| Project | Version | Notes |
|---------|---------|-------|
| 🌍 Site | `v1.0.0` | Landing page / comments / QR code |
| 🚀 Space Flight Sim | `v1.3.0` | Autopilot, interplanetary nav, station docking |
| ⛏️ Block World | `v2.0.0` | Survival + Creative modes |
| 🌻 Plants vs Zombies | `v1.0.0` | Tower defense + quiz challenges |

Versions live in `assets/version.js`. **Don't edit it by hand** — use the script:

```bash
node tools/bump.js                       # sync date + git hash only
node tools/bump.js minecraft major       # Block World 2.0.0 → 3.0.0
node tools/bump.js sfs minor             # Space Flight Sim 1.3.0 → 1.4.0
node tools/bump.js site patch            # Site 1.0.0 → 1.0.1
```

---

## 📜 Changelog

### Site v1.0.0 · 2026-10-03
- Added a **QR code** on the landing page (generated offline, scan to open the site).
- Added a **💬 Comments** tab (Giscus, backed by this repo's Discussions).
- Redesigned the landing page: gradient title, card hover effects, mobile layout.
- Introduced versioning (`assets/version.js` + `tools/bump.js`).

### ⛏️ Block World v2.0.0 · 2026-10-03
- **Survival mode**: 20 HP (10 hearts), 20 food (10 drumsticks), starvation damage, healing when full, fall damage, death & respawn.
- **Creative mode**: unlimited resources, instant break, **double-tap Space to fly** (Space up / Shift down).
- Hunting: cows and sheep have 5 HP, 5 punches to kill, drop steak / mutton, auto-pickup when near, eat with right click after pressing `9`.
- Press `M` anytime to switch modes; saves store mode, HP, food and inventory.

### 🚀 Space Flight Sim v1.3.0 · 2026-10-03
- Autopilot: automatic orbit insertion and landing.
- Interplanetary navigation: plan transfer orbits to other bodies.
- Side-mounted parts, off-axis torque, station docking services, blueprint share codes.

### 🌻 Plants vs Zombies v1.0.0
- First release: classic tower defense + math / English quiz challenges.

---

## 🛠️ About This Project

- Built with pure **HTML + JavaScript + Canvas / WebGL** — **zero dependencies, zero frameworks**.
- Each game lives in its own folder (`games/<name>/`), easy to maintain and extend.
- The `index.html` landing page is **bilingual**: it shows Chinese / English based on your browser language, with a 🌐 toggle in the top-right corner.
- Developed and maintained by **Eason Liang** in his free time.

---

© Eason Liang · Shanghai, China · 5th Grade · Made with 💙 and a lot of curiosity
