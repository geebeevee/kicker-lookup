// v1.18

// -----------------------------
// Song Search Logic
// -----------------------------

const songInput = document.getElementById("songInput");
const songSuggestions = document.getElementById("songSuggestions");
const songResults = document.getElementById("songResults");

let uniqueSongs = [];

function buildSongList() {
  if (!Array.isArray(songSubmissions)) {
    console.warn("songSubmissions not loaded yet");
    return;
  }
  uniqueSongs = [...new Set(songSubmissions.map(s => s.song))].sort((a,b) => a.localeCompare(b));
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadArtistCounts();
  buildSongList();
});

// -----------------------------
// Render results as table
// -----------------------------
function renderSongTable(matches, title) {
  if (!matches.length) {
    songResults.innerHTML = `<p>No songs found.</p>`;
    return;
  }

  const rows = matches
    .sort((a, b) => String(a.league).localeCompare(String(b.league), undefined, { numeric: true }) || a.song.localeCompare(b.song))
    .map(s => {
      const params = new URLSearchParams({ song: s.song, artist: s.artist, league: s.league });
      return `<tr>
        <td><a href="summary.html?${params}" class="summary-link">${s.song}</a></td>
        <td>${s.artist}</td>
        <td>${s.league}</td>
      </tr>`;
    }).join('');

  songResults.innerHTML = `
    ${title ? `<p style="font-size:13px;opacity:.65;margin-bottom:8px;">${title}</p>` : ''}
    <table class="song-table">
      <thead><tr><th>Song</th><th>Artist</th><th>League</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// -----------------------------
// Autocomplete
// -----------------------------
if (songInput && songSuggestions) {

  songInput.addEventListener("input", () => {
    const query = songInput.value.toLowerCase();
    songSuggestions.innerHTML = '';
    highlightIndex = -1;

    if (!query) {
      songSuggestions.style.display = 'none';
      songResults.innerHTML = '';
      return;
    }

    const matches = uniqueSongs.filter(song => song.toLowerCase().includes(query));

    if (matches.length > 0) {
      songSuggestions.style.display = 'block';
      matches.slice(0, 20).forEach(match => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = match;
        div.onclick = () => {
          songInput.value = match;
          songSuggestions.style.display = 'none';
          showSongResults(match);
        };
        songSuggestions.appendChild(div);
      });
    } else {
      songSuggestions.style.display = 'none';
    }
  });

  songInput.addEventListener("keydown", (e) => {
    const items = songSuggestions.querySelectorAll(".suggestion");
    const count = items.length;

    if (e.key === "ArrowDown" && count > 0) {
      e.preventDefault();
      highlightIndex = (highlightIndex + 1) % count;
    }
    if (e.key === "ArrowUp" && count > 0) {
      e.preventDefault();
      highlightIndex = (highlightIndex - 1 + count) % count;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && items[highlightIndex]) {
        items[highlightIndex].click();
        return;
      }
      // Enter with no selection = show ALL matches for the typed query
      songSuggestions.style.display = 'none';
      runSongSearch(songInput.value);
      return;
    }

    items.forEach((item, i) => {
      const isHighlighted = i === highlightIndex;
      item.classList.toggle("highlight", isHighlighted);
      if (isHighlighted) item.scrollIntoView({ block: "nearest" });
    });
  });

  songSuggestions.addEventListener("click", (e) => {
    if (!e.target.classList.contains("suggestion")) return;
    const selectedSong = e.target.textContent;
    songInput.value = selectedSong;
    songSuggestions.style.display = "none";
    showSongResults(selectedSong);
  });
}

// -----------------------------
// Full search (Enter key) — all contains matches
// -----------------------------
function runSongSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return;

  const matches = songSubmissions.filter(s => s.song.toLowerCase().includes(q));
  renderSongTable(matches, `${matches.length} result${matches.length !== 1 ? 's' : ''} for "${query}"`);
}

// -----------------------------
// Show results for exact selected song (click/autocomplete)
// -----------------------------
function showSongResults(songName) {
  const matches = songSubmissions.filter(s => s.song === songName);
  renderSongTable(matches, matches.length > 1 ? `${matches.length} submissions of "${songName}"` : '');
}
