// v1.15

// -----------------------------
// Dark mode toggle persistence
// -----------------------------
const toggleBtn = document.getElementById('darkToggle');
const storedTheme = localStorage.getItem('theme');
if (storedTheme === 'dark') document.body.classList.add('dark');
toggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// -----------------------------------
// Data sources (submissions + hits/misses)
// -----------------------------------

// Prod Links
const artisttsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeM1Sc2iN556e_zWnxQagRLkXSpAs8k0OyBdlay0qF1OylOOTdaNReXJVPhzkhgQ/pub?gid=42417497&single=true&output=tsv";   // Prod Submissions
const topHitsUrl   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeM1Sc2iN556e_zWnxQagRLkXSpAs8k0OyBdlay0qF1OylOOTdaNReXJVPhzkhgQ/pub?gid=1916696459&single=true&output=tsv";      // Prod Hits
const lowestMissesUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeM1Sc2iN556e_zWnxQagRLkXSpAs8k0OyBdlay0qF1OylOOTdaNReXJVPhzkhgQ/pub?gid=1666455778&single=true&output=tsv";  // Low Misses



// Testing Links
// const artisttsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG9L-FXugJcPmIuC4UHMajvGaZOG7JV42k6xNuu3sysNghVJSyXnoOPm81WD5aMg/pub?gid=42417497&single=true&output=tsv";   // testingURL
// const topHitsUrl   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG9L-FXugJcPmIuC4UHMajvGaZOG7JV42k6xNuu3sysNghVJSyXnoOPm81WD5aMg/pub?gid=1916696459&single=true&output=tsv";      // testingURL
// const lowestMissesUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG9L-FXugJcPmIuC4UHMajvGaZOG7JV42k6xNuu3sysNghVJSyXnoOPm81WD5aMg/pub?gid=1666455778&single=true&output=tsv";  // testingURL

let artistCounts = {}, artistSongs = {}, allowableArtistCount = 4, current = 0;
let topHitsMap = new Map(), lowestMissesMap = new Map();
let songSubmissions = [];
let flaggedArtists = [];
let highlightIndex = -1;


// Normalizer for consistent matching
function norm(str) {
  return String(str || "").trim().toLowerCase();
}

// -----------------------------
// Load artist data + build songSubmissions (TSV version)
// -----------------------------
async function loadArtistCounts() {
  // ✅ Make sure your URL ends with output=tsv
  const res = await fetch(artisttsvUrl);
  const tsv = await res.text();
  const lines = tsv.split(/\r?\n/);

  // --- Row 1: Allowable Artist Count ---
  let headerLine = lines.shift() || "";
  const headerCols = headerLine.split("\t").map(c => c.trim());
  const lastCell = headerCols[headerCols.length - 1];
  const parsedCount = parseInt(lastCell, 10);
  allowableArtistCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 4;

  // --- Row 2: Artist data header, detect current league ---
  const headerLine2 = lines.shift() || "";
  const cols2 = headerLine2.split("\t").map(c => c.trim());
  const leagueLabel = [...cols2].reverse().find(c => c.toUpperCase().startsWith("LEAGUE"));
  const leagueMatch = leagueLabel?.match(/LEAGUE\s*(\d+)/i);
  currentleague = leagueMatch ? parseInt(leagueMatch[1], 10) : 1;

  // --- Remaining rows: submissions ---
  artistCounts = {};
  artistSongs = {};
  songSubmissions = [];

  let highestLeagueSeen = currentleague;

  lines.forEach(line => {
    if (!line.trim()) return;

    const cols = line.split("\t").map(c => c.trim());
    const league = parseInt(cols[0], 10);
    const artist = cols[1];
    const song = cols[2];

    if (!artist) return;

    // Track highest league
    if (!isNaN(league) && league > highestLeagueSeen) highestLeagueSeen = league;

    // Artist counts
    artistCounts[artist] = (artistCounts[artist] || 0) + 1;

    // Artist → songs mapping
    if (!artistSongs[artist]) artistSongs[artist] = [];
    artistSongs[artist].push({ song, league });

    // Song search data
    songSubmissions.push({
      song,
      artist,
      league
    });
  });

  // --- Fallback if header didn't give league ---
  if (!Number.isFinite(currentleague) || currentleague <= 0) {
    currentleague = highestLeagueSeen;
  }

  console.log("Allowable artist count:", allowableArtistCount);
  console.log("Current league number:", currentleague);
  console.log("Song submissions loaded:", songSubmissions.length);
  return true;
}



// -----------------------------
// Load Top Hits (TSV version)
// -----------------------------
async function loadTopHits() {
  try {
    const res = await fetch(topHitsUrl);
    const tsv = await res.text();
    const lines = tsv.split(/\r?\n/);

    lines.shift(); // skip row 1
    lines.shift(); // skip headers row

    topHitsMap = new Map();

    lines.forEach(line => {
      if (!line.trim()) return;

      const cols = line.split("\t").map(c => c.trim());
      const artist = norm(cols[0]);
      const song = norm(cols[1]);

      if (artist && song) {
        if (!topHitsMap.has(artist)) topHitsMap.set(artist, []);
        topHitsMap.get(artist).push(song);
      }
    });

  } catch {
    topHitsMap = new Map();
  }
}



// -----------------------------
// Load Lowest Misses (TSV version)
// -----------------------------
async function loadLowestMisses() {
  try {
    const res = await fetch(lowestMissesUrl);
    const tsv = await res.text();
    const lines = tsv.split(/\r?\n/);

    lines.shift(); // skip row 1
    lines.shift(); // skip headers row

    lowestMissesMap = new Map();

    lines.forEach(line => {
      if (!line.trim()) return;

      const cols = line.split("\t").map(c => c.trim());
      const artist = norm(cols[0]);
      const song = norm(cols[1]);

      if (artist && song) {
        if (!lowestMissesMap.has(artist)) lowestMissesMap.set(artist, []);
        lowestMissesMap.get(artist).push(song);
      }
    });

  } catch {
    lowestMissesMap = new Map();
  }
}

// -------------------------------
// Autocomplete and selection
// -------------------------------
const input = document.getElementById('artistInput');
const suggestions = document.getElementById('suggestions');
const result = document.getElementById('result');

if (input && suggestions) {
  input.addEventListener("input", () => {
    const query = input.value.toLowerCase();
    suggestions.innerHTML = '';
    if (!query) {
      suggestions.style.display = 'none';
      return;
    }

    const matches = Object.keys(artistCounts).filter(a =>
      a.toLowerCase().includes(query)
    );

    if (matches.length > 0) {
      suggestions.style.display = 'block';
      matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = match;
        div.onclick = () => selectArtist(match);
        suggestions.appendChild(div);
      });
    } else {
      suggestions.style.display = 'none';
    }
  });
}



function selectArtist(artist) {
  input.value = artist;
  suggestions.style.display = 'none';
  const count = artistCounts[artist] || 0;
  const songs = artistSongs[artist] || [];

  // Sort by league ascending
  const sortedSongs = songs.slice().sort((a, b) => a.league - b.league);

  // Build plain song list
  // const songList = sortedSongs.map(s => `<li>${s.song} (League ${s.league})</li>`).join("");

  
  // ✅ Build song list WITH Discogs icon at the start
const songList = sortedSongs.map(s => {
  const quoted = `"${artist}" "${s.song}"`;
  const discogsUrl = `https://www.discogs.com/search/?q=${encodeURIComponent(quoted)}&type=release`;

  return `
    <li style="list-style: none; display: flex; align-items: center; gap: 6px;">
      <a href="${discogsUrl}" target="_blank" rel="noopener noreferrer" title="Search Discogs for this track">💿</a>
      ${s.song} (League ${s.league})
    </li>
  `;
}).join("");




  // Count hits and misses (per artist only)
  const artistKey = norm(artist);
  const hitCount = topHitsMap.has(artistKey) ? topHitsMap.get(artistKey).length : 0;
  const missCount = lowestMissesMap.has(artistKey) ? lowestMissesMap.get(artistKey).length : 0;

  // Build summary lines
  let extraInfo = "";
  if (hitCount > 0) {
    extraInfo += `<br>They had ${hitCount} song(s) voted a Big Hit.`;
  }
  if (missCount > 0) {
    extraInfo += `<br>They had ${missCount} song(s) voted a Low Miss.`;
  }

  // Warnings
  let warning = "";
  if (count >= allowableArtistCount) {
    warning = `<p style="color:red"><strong>Don't Submit This Artist – too many submissions</strong></p>`;
  } else if (sortedSongs.some(s => s.league === currentleague)) {
    warning = `<p style="color:red"><strong>Don't Submit This Artist – has been played this league</strong></p>`;
  }

  // Final output
  result.innerHTML = `
    🎤 <strong>${artist}</strong> has appeared <strong>${count}</strong> time(s).${extraInfo}<br><br>
    🎶 <strong>Songs:</strong><ul>${songList}</ul>
    ${warning}
  `;
  fetchArtistInfo(artist);
}


// -------------------------------
// Search For Overused Artists
// -------------------------------

// Helper: normalize artist name for sorting
function sortKey(artist) {
  const lower = artist.toLowerCase();

  // Special case: keep "The The" as-is
  if (lower === "the the") {
    return artist;
  }

  if (lower.startsWith("the ")) {
    return artist.substring(4) + ", The";   // e.g. "Beatles, The"
  }
  if (lower.startsWith("thee ")) {
    return artist.substring(5) + ", Thee";  // e.g. "Silver Mt. Zion, Thee"
  }
  if (lower.startsWith("a ")) {
    return artist.substring(2) + ", A";     // e.g. "Perfect Circle, A"
  }
  if (lower.startsWith("an ")) {
    return artist.substring(3) + ", An";    // e.g. "Horse, An"
  }
  return artist;
}


function renderFlaggedArtists() {
  const flaggedList = document.getElementById('flaggedList');
  if (!flaggedList) return;   // ✅ Skip on Song Lookup page

  // Build flagged list fresh each time
  const flaggedArtistsLocal = Object.entries(artistCounts)
    .filter(([artist, count]) => count >= allowableArtistCount)
    .sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])));

  flaggedList.innerHTML = flaggedArtistsLocal.map(([artist, count]) => {
    const lower = artist.toLowerCase();
    let displayName = artist;

    if (lower === "the the") {
      displayName = artist;
    } else if (lower.startsWith("the ")) {
      displayName = artist.substring(4) + ", The";
    } else if (lower.startsWith("thee ")) {
      displayName = artist.substring(5) + ", Thee";
    } else if (lower.startsWith("a ")) {
      displayName = artist.substring(2) + ", A";
    } else if (lower.startsWith("an ")) {
      displayName = artist.substring(3) + ", An";
    }

    return `<li>${displayName} (${count})</li>`;
  }).join('');
}



// -------------------------------
// Toggle flagged panel visibility
// -------------------------------

const flaggedPanel = document.querySelector('.flagged-panel');
const togglePanelButton = document.getElementById('toggleFlaggedPanel');

if (flaggedPanel && togglePanelButton) {

  // Load previous state
  let panelHidden = localStorage.getItem('flaggedPanelHidden') === 'true';
  flaggedPanel.style.display = panelHidden ? 'none' : 'block';
  togglePanelButton.textContent = panelHidden ? 'Show Most Submitted' : 'Hide Most Submitted';

  togglePanelButton.addEventListener('click', () => {
    panelHidden = !panelHidden;
    flaggedPanel.style.display = panelHidden ? 'none' : 'block';
    togglePanelButton.textContent = panelHidden ? 'Show Most Submitted' : 'Hide Most Submitted';
    localStorage.setItem('flaggedPanelHidden', panelHidden);
  });
}

// -----------------------------
// Wikipedia helpers (clean, unified, with disambiguation + ranking)
// -----------------------------

// Fetch a single page summary
async function fetchSummary(title) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetch pageviews for ranking
async function fetchPageviews(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);

  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encoded}/monthly/${fmt(start)}/${fmt(end)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return 0;

    const data = await res.json();
    if (!data.items) return 0;

    return data.items.reduce((sum, item) => sum + (item.views || 0), 0);
  } catch {
    return 0;
  }
}

// Full Wikipedia search (music-filtered + pageview-ranked)
async function searchWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&origin=*`;

    const res = await fetch(url);
    if (!res.ok) return { type: "none" };

    const data = await res.json();
    let results = data.query.search;

    if (results.length === 0) return { type: "none" };

    // If Wikipedia only returns one result at all → treat as single
    if (results.length === 1) {
      return { type: "single", title: results[0].title };
    }

    // ✅ Fetch summaries for all results to detect redirects properly
    const enriched = await Promise.all(
      results.map(async r => {
        const summary = await fetchSummary(r.title);
        const resolvedTitle = summary?.title?.toLowerCase() || r.title.toLowerCase();
        return {
          ...r,
          summary,
          resolvedTitle
        };
      })
    );

    // ✅ Strong band detection using resolved titles
    const musicKeywords = ["band", "rock", "punk", "music", "group", "album", "singer"];

    const filtered = enriched.filter(r => {
      const title = r.resolvedTitle;
      const snippet = r.snippet.toLowerCase();

      // ✅ Direct band-page detection (handles redirects like "Personal Trainer" → "Personal Trainer (band)")
      if (title.endsWith("(band)")) return true;

      // ✅ Keyword detection
      return musicKeywords.some(k =>
        title.includes(k) || snippet.includes(k)
      );
    });

    // ✅ NEW: collapse duplicate band pages (redirects → same canonical title)
    const unique = [];
    const seen = new Set();

    for (const r of filtered) {
      const key = r.resolvedTitle; // e.g. "personal trainer (band)"
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    // ✅ OPTION B:
    // If exactly one unique band/music page exists → auto-select it
    if (unique.length === 1) {
      return { type: "single", title: unique[0].summary.title };
    }

    // ✅ If multiple musicy results exist → rank them
    const candidates = unique.length ? unique : enriched;

    const ranked = await Promise.all(
      candidates.slice(0, 12).map(async opt => ({
        ...opt,
        views: await fetchPageviews(opt.summary?.title || opt.title)
      }))
    );

    ranked.sort((a, b) => b.views - a.views);

    return {
      type: "multiple",
      options: ranked.map(r => ({
        title: r.summary?.title || r.title,
        snippet: r.snippet,
        views: r.views
      }))
    };

  } catch {
    return { type: "none" };
  }
}


// Try multiple suffix variants (band, singer, etc.)
async function trySummaryVariants(variants, artist) {
  const results = await Promise.all(
    variants.map(name => fetchSummary(name))
  );

  // Filter out null and disambiguation pages
  let valid = results
    .map((data, i) => ({ data, variant: variants[i] }))
    .filter(x => x.data && x.data.type !== "disambiguation");

  if (valid.length === 0) return null;

  // ✅ Deduplicate by resolved title (handles redirects)
  const unique = [];
  const seen = new Set();

  for (const v of valid) {
    const title = v.data.title;
    if (!seen.has(title)) {
      seen.add(title);
      unique.push(v);
    }
  }

  // ✅ If more than one unique variant resolves → show chooser
  if (unique.length > 1) {
    const infoBox = document.getElementById("artistInfo");
    infoBox.innerHTML = `
      <h2>${artist}</h2>
      <p>Multiple possible artist pages found. Choose one:</p>
      <ul>
        ${unique.map(v => `
          <li>
            <a href="#" data-title="${v.data.title}" class="wiki-link">
              ${v.data.title}
            </a>
          </li>
        `).join("")}
      </ul>
    `;

    infoBox.querySelectorAll(".wiki-link[data-title]").forEach(a => {
      a.addEventListener("click", async e => {
        e.preventDefault();
        const chosen = a.getAttribute("data-title");
        infoBox.innerHTML = "<em>Loading...</em>";
        const chosenSummary = await fetchSummary(chosen);
        if (chosenSummary && chosenSummary.type !== "disambiguation") {
          renderSummary(infoBox, chosenSummary);
        } else {
          infoBox.innerHTML = `<p>No definitive artist summary for <strong>${chosen}</strong>.</p>`;
        }
      });
    });

    return "UI_HANDLED";
  }

  // ✅ Exactly one unique match → return it
  return unique[0].data;
}

// Render the final summary into the UI
function renderSummary(infoBox, data) {
  infoBox.innerHTML = `
    <h2>${data.title}</h2>
    ${
      data.thumbnail
        ? `<img src="${data.thumbnail.source}" alt="${data.title}">`
        : ""
    }
    <p>${data.extract || "No summary available."}</p>
    ${
      data.content_urls?.desktop?.page
        ? `<a class="wiki-link" href="${data.content_urls.desktop.page}" target="_blank" rel="noopener">Read more</a>`
        : ""
    }
  `;
}

// -----------------------------
// Main artist info resolver (clean + unified)
// -----------------------------
async function fetchArtistInfo(artist) {
  const infoBox = document.getElementById("artistInfo");
  infoBox.innerHTML = "<em>Loading artist info...</em>";

  // ✅ Boost search for single-word ambiguous names
  let searchQuery = artist;
  if (/^[a-zA-Z]+$/.test(artist) && artist.split(" ").length === 1) {
    searchQuery = `${artist} band`;
  }

  // 0) Direct "(band)" lookup for single-word names
if (/^[a-zA-Z]+$/.test(artist) && artist.split(" ").length === 1) {
  const cleanArtist = artist.trim();
  const bandTitle =
    `${cleanArtist.charAt(0).toUpperCase() + cleanArtist.slice(1)} (band)`;

  const bandSummary = await fetchSummary(bandTitle);

  if (bandSummary && bandSummary.type !== "disambiguation") {
    renderSummary(infoBox, bandSummary);
    return;
  }
}

  // Direct "(musician)" lookup for single-word artist names
if (/^[a-zA-Z]+$/.test(artist) && artist.split(" ").length === 1) {
  const cleanArtist = artist.trim();
  const musicianTitle =
    `${cleanArtist.charAt(0).toUpperCase() + cleanArtist.slice(1)} (musician)`;

  const musicianSummary = await fetchSummary(musicianTitle);

  if (musicianSummary && musicianSummary.type !== "disambiguation") {
    renderSummary(infoBox, musicianSummary);
    return;
  }
}




  // Variant suffixes for direct lookup
  const variantSuffixes = [
    " (American band)",
    " (British band)",
    " (Australian band)",
    " (Welsh band)",
    " (New Zealand band)",
    " (French band)",
    " (band)",
    " (musical group)", " (music group)",
    " (duo)", " (rock band)", " (pop band)", " (hip hop group)",
    " (artist)", " (singer)", " (rapper)",
    " (English band)", " (Scottish band)", " (Irish band)", " (Canadian band)",
    "" // plain name LAST
  ];
  const variants = variantSuffixes.map(s => `${artist}${s}`);

  // 1) Try direct summary variants
  const page = await trySummaryVariants(variants, artist);
  if (page === "UI_HANDLED") return;
  if (page) {
    renderSummary(infoBox, page);
    return;
  }

  // 2) Full Wikipedia search with chooser
  const search = await searchWikipedia(searchQuery);

  if (search.type === "single") {
    const summary = await fetchSummary(search.title);
    if (summary && summary.type !== "disambiguation") {
      renderSummary(infoBox, summary);
      return;
    }
  }

  if (search.type === "multiple") {
    infoBox.innerHTML = `
      <h2>${artist}</h2>
      <p>Multiple possible matches found. Choose one:</p>
      <ul>
        ${search.options
          .slice(0, 8)
          .map(
            opt => `
          <li>
            <a href="#" data-title="${opt.title}" class="wiki-link">
              ${opt.title}
            </a>
            <br><small>${opt.snippet || ""}</small>
            <br><small style="opacity:0.7;">${opt.views.toLocaleString()} views last year</small>
          </li>
        `
          )
          .join("")}
      </ul>
    `;

    infoBox.querySelectorAll(".wiki-link[data-title]").forEach(a => {
      a.addEventListener("click", async e => {
        e.preventDefault();
        const chosen = a.getAttribute("data-title");
        infoBox.innerHTML = "<em>Loading...</em>";
        const chosenSummary = await fetchSummary(chosen);
        if (chosenSummary && chosenSummary.type !== "disambiguation") {
          renderSummary(infoBox, chosenSummary);
        } else {
          infoBox.innerHTML = `<p>No definitive artist summary for <strong>${chosen}</strong>.</p>`;
        }
      });
    });

    return;
  }

  // 3) Final fallback
  infoBox.innerHTML = `<p>No artist info found for <strong>${artist}</strong>.</p>`;
}



// -----------------------------
// Initial data load
// -----------------------------

(async function init() {
  await loadArtistCounts();
  await Promise.all([loadTopHits(), loadLowestMisses()]);
  renderFlaggedArtists();   // ✅ function builds its own flagged list
})();
