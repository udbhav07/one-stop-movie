# ONESTOP MOVIE

A movie discovery app built on the [TMDB API](https://www.themoviedb.org/documentation/api)
and Firebase. Users sign in, browse what's trending, filter by genre, search,
save films to a watchlist, rate them, and get recommendations seeded from what
they've rated and saved.

No build step and no dependencies — plain ES modules, with the Firebase SDK
loaded from a CDN.

## Structure

```
public/                  deployed to Firebase Hosting
├── index.html           login / register
├── homepage.html        the app
├── 404.html
├── assets/logo.png
├── css/
│   ├── auth.css
│   └── homepage.css
└── js/
    ├── env.js           generated from .env — gitignored
    ├── firebase.js      SDK init, exports auth + database
    ├── auth.js          register, login, validation, redirect
    └── homepage.js      watchlist, ratings, trending, recommendations, search

scripts/generate-env.js  writes public/js/env.js and .firebaserc from .env
database.rules.json      per-user access rules
firebase.json            hosting + database config
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
node scripts/generate-env.js
```

The site reads `public/js/env.js`, which that script generates. It's gitignored,
so a fresh clone must run the script before the app will load.

## Run

```bash
firebase serve           # http://localhost:5000
```

## Deploy

```bash
firebase deploy --only database,hosting
```

`--only database` pushes `database.rules.json`. Skip it and the rules on the
server stay whatever they were.

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

## A note on keys

The Firebase web config and the TMDB key both ship to the browser — that's
unavoidable in a client-only app, and the Firebase values are public by design.
They live in `.env` to keep the repo clean and make swapping projects a
one-liner, not to hide them. Actual protection comes from the database rules
above and from restricting the API keys in the Google Cloud console.
