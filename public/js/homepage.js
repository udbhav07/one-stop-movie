import { auth, database } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { ENV } from './env.js';

// TMDB API config
const API_KEY = ENV.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const NO_POSTER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">
     <rect width="100%" height="100%" fill="#370617"/>
     <text x="50%" y="50%" fill="#F9F7C9" font-family="sans-serif" font-size="20"
           text-anchor="middle">No Image</text>
   </svg>`
);

const DISCOVER_URL = `${BASE_URL}/discover/movie?sort_by=popularity.desc&api_key=${API_KEY}`;
const TRENDING_URL = `${BASE_URL}/trending/movie/week?api_key=${API_KEY}`;
const SEARCH_URL = `${BASE_URL}/search/movie?api_key=${API_KEY}`;
const recommendationsURL = (id) => `${BASE_URL}/movie/${id}/recommendations?api_key=${API_KEY}`;

const genres = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" }
];

// DOM handles
const main = document.getElementById("main");
const tags = document.getElementById("tags");
const viewTitle = document.getElementById("view-title");
const search = document.getElementById("search");
const searchForm = document.getElementById("search_form");
const accountdetails = document.querySelector('.account-details');

// User state, mirrored from the Realtime Database so cards can render
// their saved/rated status without a round trip per movie.
let currentUser = null;
let watchlist = new Map();   // movieId -> stored movie snapshot
let ratings = new Map();     // movieId -> 1..5
let selectedTags = [];
let currentView = 'trending';

// ---------------------------------------------------------------- user data

const userRef = (path) => ref(database, `users/${currentUser.uid}/${path}`);

async function loadUserData() {
  watchlist = new Map();
  ratings = new Map();

  const [watchSnap, rateSnap] = await Promise.all([
    get(userRef('watchlist')),
    get(userRef('ratings'))
  ]);

  // forEach on the snapshot rather than the raw value: the Realtime Database
  // hands back an array when keys look like sequential integers, and this
  // reads the real key either way.
  watchSnap.forEach(child => watchlist.set(Number(child.key), child.val()));
  rateSnap.forEach(child => ratings.set(Number(child.key), child.val().rating));
}

async function toggleWatchlist(movie) {
  if (watchlist.has(movie.id)) {
    watchlist.delete(movie.id);
    await remove(userRef(`watchlist/${movie.id}`));
  } else {
    // Store a snapshot so "My List" renders without re-querying TMDB.
    const entry = {
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path || "",
      vote_average: movie.vote_average || 0,
      overview: movie.overview || "",
      added_at: Date.now()
    };
    watchlist.set(movie.id, entry);
    await set(userRef(`watchlist/${movie.id}`), entry);
  }
}

async function rateMovie(movie, rating) {
  if (ratings.get(movie.id) === rating) {
    // Clicking the current rating again clears it.
    ratings.delete(movie.id);
    await remove(userRef(`ratings/${movie.id}`));
    return;
  }
  ratings.set(movie.id, rating);
  await set(userRef(`ratings/${movie.id}`), {
    rating,
    title: movie.title,
    rated_at: Date.now()
  });
}

// ------------------------------------------------------------------- views

function setView(view, title) {
  currentView = view;
  viewTitle.textContent = title;
  tags.style.display = (view === 'trending' || view === 'browse') ? 'flex' : 'none';

  document.querySelectorAll('.nav-view').forEach(link => {
    link.classList.toggle('active', link.dataset.view === view);
  });
}

async function fetchMovies(url) {
  main.innerHTML = "<h2 class='status'>Loading…</h2>";
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    main.innerHTML = "<h2 class='status'>Could not reach TMDB. Check your connection.</h2>";
    return null;
  }
}

async function showTrending() {
  setView('trending', 'Trending This Week');
  selectedTags = [];
  highlightTags();
  const results = await fetchMovies(TRENDING_URL);
  if (results) showMovies(results);
}

async function showByGenre() {
  if (selectedTags.length === 0) return showTrending();
  const names = genres.filter(g => selectedTags.includes(g.id)).map(g => g.name);
  setView('browse', names.join(' · '));
  const results = await fetchMovies(`${DISCOVER_URL}&with_genres=${selectedTags.join(',')}`);
  if (results) showMovies(results);
}

async function showSearch(term) {
  setView('browse', `Results for "${term}"`);
  selectedTags = [];
  highlightTags();
  const results = await fetchMovies(`${SEARCH_URL}&query=${encodeURIComponent(term)}`);
  if (results) showMovies(results);
}

function showMyList() {
  setView('mylist', 'My Watchlist');
  const saved = [...watchlist.values()].sort((a, b) => b.added_at - a.added_at);
  if (saved.length === 0) {
    main.innerHTML = "<h2 class='status'>Your watchlist is empty. Tap ♡ on any movie to save it.</h2>";
    return;
  }
  showMovies(saved);
}

// Personalized: seed from the highest-rated movies, falling back to the most
// recently saved ones, then merge TMDB's recommendations for each seed.
async function showForYou() {
  setView('foryou', 'Recommended For You');

  const rated = [...ratings.entries()]
    .filter(([, rating]) => rating >= 4)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const saved = [...watchlist.values()]
    .sort((a, b) => b.added_at - a.added_at)
    .map(m => m.id);

  const seeds = [...new Set([...rated, ...saved])].slice(0, 3);

  if (seeds.length === 0) {
    main.innerHTML = "<h2 class='status'>Rate a movie 4★ or higher, or add one to your watchlist, and recommendations will show up here.</h2>";
    return;
  }

  main.innerHTML = "<h2 class='status'>Building your recommendations…</h2>";

  const batches = await Promise.all(
    seeds.map(id => fetch(recommendationsURL(id))
      .then(res => res.json())
      .then(data => data.results || [])
      .catch(() => []))
  );

  // Movies recommended by more than one seed rank highest.
  const scored = new Map();
  batches.flat().forEach(movie => {
    if (watchlist.has(movie.id) || seeds.includes(movie.id)) return;
    const existing = scored.get(movie.id);
    if (existing) existing.hits += 1;
    else scored.set(movie.id, { movie, hits: 1 });
  });

  const results = [...scored.values()]
    .sort((a, b) => b.hits - a.hits || b.movie.popularity - a.movie.popularity)
    .slice(0, 20)
    .map(entry => entry.movie);

  if (results.length === 0) {
    main.innerHTML = "<h2 class='status'>No recommendations yet — rate a few more movies.</h2>";
    return;
  }
  showMovies(results);
}

// ---------------------------------------------------------------- rendering

function getColor(vote) {
  if (vote >= 8) return "green";
  else if (vote >= 5) return "orange";
  else return "red";
}

function buildStars(movie) {
  const stars = document.createElement('div');
  stars.classList.add('stars');
  stars.title = 'Your rating';

  for (let value = 1; value <= 5; value++) {
    const star = document.createElement('span');
    star.classList.add('star');
    star.textContent = '★';
    star.dataset.value = value;

    star.addEventListener('click', async () => {
      await rateMovie(movie, value);
      paintStars(stars, ratings.get(movie.id) || 0);
    });

    stars.append(star);
  }

  paintStars(stars, ratings.get(movie.id) || 0);
  return stars;
}

function paintStars(container, rating) {
  container.querySelectorAll('.star').forEach(star => {
    star.classList.toggle('filled', Number(star.dataset.value) <= rating);
  });
}

function buildWatchButton(movie) {
  const btn = document.createElement('button');
  btn.classList.add('watch-btn');
  btn.type = 'button';

  const paint = () => {
    const saved = watchlist.has(movie.id);
    btn.classList.toggle('saved', saved);
    btn.textContent = saved ? '♥' : '♡';
    btn.title = saved ? 'Remove from watchlist' : 'Add to watchlist';
    btn.setAttribute('aria-label', btn.title);
  };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await toggleWatchlist(movie);
    btn.disabled = false;
    paint();
    // Removing from the watchlist while viewing it should drop the card.
    if (currentView === 'mylist') showMyList();
  });

  paint();
  return btn;
}

function showMovies(data) {
  main.innerHTML = "";

  if (!data || data.length === 0) {
    main.innerHTML = "<h2 class='status'>No results found.</h2>";
    return;
  }

  data.forEach(movie => {
    const { title, poster_path, vote_average, overview } = movie;

    const movieEl = document.createElement("div");
    movieEl.classList.add('movie');

    const posterWrap = document.createElement('div');
    posterWrap.classList.add('poster');

    const img = document.createElement('img');
    img.src = poster_path ? IMG_URL + poster_path : NO_POSTER;
    img.alt = title;
    posterWrap.append(img, buildWatchButton(movie));

    const info = document.createElement('div');
    info.classList.add('movie-info');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const score = document.createElement('span');
    score.classList.add(getColor(vote_average));
    score.textContent = Number(vote_average).toFixed(1);
    score.title = 'TMDB score';
    info.append(heading, score);

    const actions = document.createElement('div');
    actions.classList.add('movie-actions');
    actions.append(buildStars(movie));

    const overviewEl = document.createElement('div');
    overviewEl.classList.add('overview');
    const overviewHeading = document.createElement('h3');
    overviewHeading.textContent = 'Overview';
    const overviewText = document.createElement('p');
    overviewText.textContent = overview || 'No overview available.';
    overviewEl.append(overviewHeading, overviewText);

    movieEl.append(posterWrap, info, actions, overviewEl);
    main.appendChild(movieEl);
  });
}

function getGenres() {
  tags.innerHTML = "";
  genres.forEach(genre => {
    const tag = document.createElement('div');
    tag.classList.add("tag");
    tag.id = genre.id;
    tag.innerText = genre.name;

    tag.addEventListener("click", () => {
      if (selectedTags.includes(genre.id)) {
        selectedTags = selectedTags.filter(id => id !== genre.id);
      } else {
        selectedTags.push(genre.id);
      }
      highlightTags();
      showByGenre();
    });

    tags.append(tag);
  });
}

function highlightTags() {
  // The clear button keeps its own highlight styling.
  document.querySelectorAll(".tag:not(#clear)").forEach(tag => tag.classList.remove("highlight"));

  if (selectedTags.length !== 0) {
    selectedTags.forEach(id => {
      const highlightedTag = document.getElementById(id);
      if (highlightedTag) highlightedTag.classList.add("highlight");
    });
    showClearButton();
  } else {
    removeClearButton();
  }
}

function showClearButton() {
  if (document.getElementById('clear')) return;

  const clear = document.createElement('div');
  clear.classList.add('tag', 'highlight');
  clear.id = 'clear';
  clear.innerText = 'Clear x';
  clear.addEventListener('click', () => {
    selectedTags = [];
    highlightTags();
    showTrending();
  });

  tags.append(clear);
}

function removeClearButton() {
  const clearBtn = document.getElementById('clear');
  if (clearBtn) clearBtn.remove();
}

// -------------------------------------------------------------------- wiring

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const searchTerm = search.value.trim();
  if (searchTerm) showSearch(searchTerm);
  else showTrending();
});

document.querySelectorAll('.nav-view').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    if (view === 'trending') showTrending();
    if (view === 'foryou') showForYou();
    if (view === 'mylist') showMyList();
  });
});

// Counts change as the user saves and rates, so rebuild on open.
document.querySelector('#account-link').addEventListener('click', () => {
  if (currentUser) setupUI(currentUser);
});

document.querySelector('#logout').addEventListener('click', (e) => {
  e.preventDefault();
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

const setupUI = (user) => {
  accountdetails.innerHTML = "";

  const row = (label, value) => {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = label + ' ';
    div.append(strong, document.createTextNode(value));
    return div;
  };

  accountdetails.append(
    row('Logged in as:', user.email),
    row('Saved movies:', String(watchlist.size)),
    row('Movies rated:', String(ratings.size))
  );
};

// Auth gate: everything below needs a signed-in user.
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  getGenres();

  try {
    await loadUserData();
  } catch (err) {
    console.error('Could not load your saved data:', err);
  }

  setupUI(user);
  showTrending();
});
