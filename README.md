# ONESTOP MOVIE

A movie discovery app built on the [TMDB API](https://www.themoviedb.org/documentation/api)
and Firebase. Users sign in, browse what's trending, filter by genre, search,
save films to a watchlist, rate them, and get recommendations seeded from what
they've rated and saved.

Plain ES modules built with Vite, with the Firebase SDK loaded from a CDN.

## Structure

```
public/                  source pages, built into dist/
├── index.html           login / register
├── homepage.html        the app
├── 404.html
├── assets/logo.png
├── css/
│   ├── auth.css
│   └── homepage.css
└── js/
    ├── firebase.js      SDK init, exports auth + database
    ├── auth.js          register, login, validation, redirect
    └── homepage.js      watchlist, ratings, trending, recommendations, search

vite.config.js           build config, exposes .env to import.meta.env
database.rules.json      per-user access rules
firebase.json            database rules config
```

## Setup

In the [Firebase console](https://console.firebase.google.com/), create a project, then:

1. **Realtime Database → Create database.** Do this *before* step 3 — the SDK
   config snippet only includes `databaseURL` once the instance exists.
2. **Authentication → Sign-in method → enable Email/Password.**
3. **Project settings → Your apps → Web app**, and copy the config values.

Locally:

```bash
cp .env.example .env     # paste the config values in
npm install
```

The code reads the values through `import.meta.env`; `.env` is gitignored.

## Run

```bash
npm run dev              # http://localhost:5173
```

## Deploy

Hosted on Cloudflare Pages:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: the same names as in `.env.example`

Database rules still go to Firebase:

```bash
firebase deploy --only database
```

Skip that and the rules on the server stay whatever they were.

## Data model

```
users/{uid}/
├── email, full_name, last_login
├── watchlist/{movieId}    id, title, poster_path, vote_average, overview, added_at
└── ratings/{movieId}      rating (1-5), title, rated_at
```

`database.rules.json` restricts every path to `auth.uid === $uid`, so a signed-in
user can only reach their own subtree. Ratings are validated to 1–5 server-side.

Watchlist entries store a snapshot of the movie so the list renders without
re-querying TMDB.

## Keys

All keys live in `.env` (or the host's environment variables) and are never
committed. Restrict the Firebase API key to your domain in the Google Cloud
console.
