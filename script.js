// v1.14

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
const artistCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeM1Sc2iN556e_zWnxQagRLkXSpAs8k0OyBdlay0qF1OylOOTdaNReXJVPhzkhgQ/pub?gid=42417497&single=true&output=csv";   // Prod Submissions
const topHitsUrl   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeM1Sc2iN556e_zWnxQagRLkXSpAs8k0OyBdlay0qF1OylOOTdaNReXJVPhzkhgQ/pub?gid=1916696459&single=true&output=csv";      // Prod Hits
const lowestMissesUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeM1Sc2iN556e_zWnxQagRLkXSpAs8k0OyBdlay0qF1OylOOTdaNReXJVPhzkhgQ/pub?gid=1666455778&single=true&output=csv";  // Low Misses



// Testing Links
// const artistCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG9L-FXugJcPmIuC4UHMajvGaZOG7JV42k6xNuu3sysNghVJSyXnoOPm81WD5aMg/pub?gid=42417497&single=true&output=csv";   // testingURL
// const topHitsUrl   = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG9L-FXugJcPmIuC4UHMajvGaZOG7JV42k6xNuu3sysNghVJSyXnoOPm81WD5aMg/pub?gid=1916696459&single=true&output=csv";      // testingURL
// const lowestMissesUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG9L-FXugJcPmIuC4UHMajvGaZOG7JV42k6xNuu3sysNghVJSyXnoOPm81WD5aMg/pub?gid=1666455778&single=true&output=csv";  // testingURL

let artistCounts = {}, artistSongs = {}, allowableArtistCount = 4, currentRound = 0;
let topHitsMap = new Map(), lowestMissesMap = new Map();
let songSubmissions = [];
let flaggedArtists = [];
let highlightIndex = -1;


// Normalizer for consistent matching
function norm(str) {
  return String(str || "").trim().toLowerCase();
}


// -----------------------------
// Load artist data + build songSubmissions
// -----------------------------

async function loadArtistCounts() {
  const res = await fetch(artistCsvUrl);
  const csv = await res.text();
  const lines = csv.split(/\r?\n/);

  // --- Row 1: Allowable Artist Count ---
  let headerLine = lines.shift() || "";
  const headerCols = headerLine.split(",").map(c => c.replace(/^"(.*)"$/, "$1").trim());
  const lastCell = headerCols[headerCols.length - 1];
  const parsedCount = parseInt(lastCell, 10);
  if (Number.isFinite(parsedCount) && parsedCount > 0) {
    allowableArtistCount = parsedCount;
  } else {
    allowableArtistCount = 4; // fallback
  }

  // --- Row 2: Artist data header, try to detect current league ---
  const headerLine2 = lines.shift() || "";
  const cols2 = headerLine2.split(",").map(c => c.replace(/^"(.*)"$/, "$1").trim());
  const leagueLabel = [...cols2].reverse().find(c => c.toUpperCase().startsWith("LEAGUE"));
  const leagueMatch = leagueLabel?.match(/LEAGUE\s*(\d+)/i);
  if (leagueMatch) {
    currentRound = parseInt(leagueMatch[1], 10);
  } else {
    currentRound = 1; // provisional, will update from submissions below
  }

  // --- Remaining rows: submissions ---
  artistCounts = {};
  artistSongs = {};
  songSubmissions = [];   // ✅ NEW: global array for song search

  let highestLeagueSeen = currentRound;

  lines.forEach(line => {
    if (!line.trim()) return;
    const cols = line.split(",").map(c => c.replace(/^"(.*)"$/, "$1").trim());
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

    // ✅ NEW: Build songSubmissions for the Song Search page
    songSubmissions.push({
      song,
      artist,
      league
    });
  });

  // --- Fallback: if row 2 didn’t give us a league, use highest seen ---
  if (!Number.isFinite(currentRound) || currentRound <= 0) {
    currentRound = highestLeagueSeen;
  }

  console.log("Allowable artist count:", allowableArtistCount);
  console.log("Current league number:", currentRound);
  console.log("Song submissions loaded:", songSubmissions.length);
  return true; // ✅ signal completion
}



// -----------------------------
// Load Top Hits (skip first row + headers; A=Artist, B=Song)
// -----------------------------
async function loadTopHits() {
  try {
    const res = await fetch(topHitsUrl);
    const csv = await res.text();
    const lines = csv.split(/\r?\n/);

    lines.shift(); // skip row 1
    lines.shift(); // skip headers row

    topHitsMap = new Map();
    lines.forEach(line => {
      if (!line.trim()) return;
      const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^"(.*)"$/, '$1')) || [];
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
// Load Lowest Misses (same format)
// -----------------------------
async function loadLowestMisses() {
  try {
    const res = await fetch(lowestMissesUrl);
    const csv = await res.text();
    const lines = csv.split(/\r?\n/);

    lines.shift(); // skip row 1
    lines.shift(); // skip headers row

    lowestMissesMap = new Map();
    lines.forEach(line => {
      if (!line.trim()) return;
      const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^"(.*)"$/, '$1')) || [];
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
  const songList = sortedSongs.map(s => `<li>${s.song} (League ${s.league})</li>`).join("");

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
  } else if (sortedSongs.some(s => s.league === currentRound)) {
    warning = `<p style="color:red"><strong>Don't Submit This Artist – has been played this round</strong></p>`;
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
// Wikipedia helpers (original fallbacks)
// -----------------------------
async function fetchSummary(title) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function searchWikipediaTitles(query) {
  try {
    const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pages || []).map(p => ({ title: p.title, description: p.description }));
  } catch {
    return [];
  }
}

async function trySummaryVariants(variants) {
  const results = await Promise.all(variants.map(name => fetchSummary(name)));
  return results.find(data => data && data.type !== "disambiguation") || null;
}

function renderSummary(infoBox, data) {
  infoBox.innerHTML = `
    <h2>${data.title}</h2>
    ${data.thumbnail ? `<img src="${data.thumbnail.source}" alt="${data.title}">` : ""}
    <p>${data.extract || "No summary available."}</p>
    ${data.content_urls?.desktop?.page ? `<a class="wiki-link" href="${data.content_urls.desktop.page}" target="_blank" rel="noopener">Read more</a>` : ""}
  `;
}

// -----------------------------
// Main artist info resolver (fallbacks preserved)
// -----------------------------
async function fetchArtistInfo(artist) {
  const infoBox = document.getElementById('artistInfo');
  infoBox.innerHTML = "<em>Loading artist info...</em>";

  const variantSuffixes = [
    " (American band)", " (British band)", " (French band)", " (band)",
    " (musical group)", " (music group)", " (duo)", " (rock band)", " (pop band)",
    " (hip hop group)", " (artist)", " (singer)", " (rapper)",
    " (English band)", " (Scottish band)", " (Irish band)", " (Canadian band)", " (Australian band)",
    "" // plain name LAST
  ];
  const variants = variantSuffixes.map(s => `${artist}${s}`);

  // 1) Try direct summary variants
  const page = await trySummaryVariants(variants);
  if (page) {
    renderSummary(infoBox, page);
    return;
  }

  // 2) Fallback: search Wikipedia and prefer music-like descriptions
  const searchResult = await searchWikipediaTitles(artist);
  if (searchResult && searchResult.length) {
    const musicKeywords = ["band","musical group","singer","rapper","musician","rock","pop","hip hop","electronic","metal","punk","folk","jazz"];
    const best = searchResult.find(r => {
      const d = (r.description || "").toLowerCase();
      return musicKeywords.some(k => d.includes(k));
    }) || searchResult[0];

    const summary = await fetchSummary(best.title);
    if (summary && summary.type !== "disambiguation") {
      renderSummary(infoBox, summary);
      return;
    }

    // Offer "Did you mean..." choices
    infoBox.innerHTML = `
      <h2>${artist}</h2>
      <p>Multiple meanings found. Did you mean:</p>
      <ul>
        ${searchResult.slice(0, 6).map(r => `
          <li><a href="#" data-title="${r.title}" class="wiki-link">${r.title}${r.description ? ` – ${r.description}` : ""}</a></li>
        `).join("")}
      </ul>
      <p>Or try the full article: <a class="wiki-link" href="https://en.wikipedia.org/wiki/${encodeURIComponent(artist)}" target="_blank" rel="noopener">Wikipedia: ${artist}</a></p>
    `;
    infoBox.querySelectorAll('.wiki-link[data-title]').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const chosen = a.getAttribute('data-title');
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
