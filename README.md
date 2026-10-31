# NameSwipe

A Tinder-style baby-name swiping app for couples: both partners swipe on baby
names separately, and when you both swipe right it's a match. Fun,
non-commercial, mobile-first web app.

> Status: repository bootstrap. The monorepo scaffold (npm workpaces,
> `apps/web` + `apps/api`, tooling) lands via the first pull requests — see
> "Branch & PR conventions" below once documented.

## Repository layout (target)

```
.
├── apps
│   ├── web   # Vite + React + TypeScript (strict) + Tailwind — the swiping UI
│   └── api   # Express + TypeScript (strict) — JSON API
└── package.json  # npm workspaces root
```
