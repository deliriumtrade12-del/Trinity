# Aura Trinity

Autonómny AI agent na Cloudflare Workers s databázou, pamäťou, reflexiou, generovaním kódu a bezpečnou autentifikáciou.

## Rýchly štart

```bash
npm install
npx wrangler login
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Nastavenie secrets

```bash
npx wrangler secret put TRINITY_ADMIN_TOKEN
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put API_TOKEN
npx wrangler secret put ACCOUNT_ID
```

## Predvolené heslo

Ak nie je nastavený `TRINITY_ADMIN_TOKEN`, aplikácia použije:

```text
29102017
```

## Funkcie

- Chat API
- D1 databázová pamäť
- Autonómne myšlienky a reflexia
- Generovanie kódu
- GitHub a Cloudflare integrácie
- Prístup chránený admin tokenom

## Struktúra projektu

```text
.
├── package.json
├── wrangler.toml
├── README.md
├── src/
│   └── index.js
└── .gitignore
```
