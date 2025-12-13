// v1.15

// -----------------------------
// Song Search Logic
// -----------------------------

const songInput = document.getElementById("songInput");
const songSuggestions = document.getElementById("songSuggestions");
const songResults = document.getElementById("songResults");

let uniqueSongs = [];

// Build list of unique song names
function buildSongList() {
  if (!Array.isArray(songSubmissions)) {
    console.warn("songSubmissions not loaded yet");
    return;
  }
  uniqueSongs = [...new Set(songSubmissions.map(s => s.song))];
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadArtistCounts();
  buildSongList();
});

// -----------------------------
// Autocomplete
// -----------------------------
if (songInput && songSuggestions) {

  // INPUT listener
  songInput.addEventListener("input", () => {
    const query = songInput.value.toLowerCase();
    songSuggestions.innerHTML = '';
    highlightIndex = -1;

    if (!query) {
      songSuggestions.style.display = 'none';
      return;
    }

    const matches = uniqueSongs.filter(song =>
      song.toLowerCase().includes(query)
    );

    if (matches.length > 0) {
      songSuggestions.style.display = 'block';
      matches.forEach(match => {
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

  // KEYBOARD NAVIGATION
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

      runSongSearch(songInput.value);
      songSuggestions.style.display = 'none';
      return;
    }

    // Highlight + scroll
    items.forEach((item, i) => {
      const isHighlighted = i === highlightIndex;
      item.classList.toggle("highlight", isHighlighted);

      if (isHighlighted) {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  });

  // ✅ CLICK SUGGESTION — correctly placed OUTSIDE keydown
  songSuggestions.addEventListener("click", (e) => {
    if (!e.target.classList.contains("suggestion")) return;

    const selectedSong = e.target.textContent;
    songInput.value = selectedSong;
    songSuggestions.style.display = "none";

    showSongResults(selectedSong);
  });
}

// -----------------------------
// Full song search
// -----------------------------
function runSongSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return;

  const matches = songSubmissions.filter(s =>
    s.song.toLowerCase().includes(q)
  );

  if (!matches.length) {
    songResults.innerHTML = `<p>No songs found containing "<strong>${query}</strong>".</p>`;
    return;
  }

  const list = matches
    .sort((a, b) => a.song.localeCompare(b.song))
    .map(s => `<p>${s.song} — ${s.artist} (League ${s.league})</p>`)
    .join("");

  songResults.innerHTML = `
    <h3>Results for "<strong>${query}</strong>"</h3>
    ${list}
  `;
}

// -----------------------------
// Show results for selected song
// -----------------------------
function showSongResults(songName) {
  const matches = songSubmissions.filter(s => s.song === songName);

  if (matches.length === 0) {
    songResults.innerHTML = `<p>No submissions found.</p>`;
    return;
  }

  songResults.innerHTML = matches
    .map(s => `<p>${s.artist} - ${s.song} (League ${s.league})</p>`)
    .join("");
}

