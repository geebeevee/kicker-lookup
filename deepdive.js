// deepdive.js — Archive Deep Dive for Kicker's Music League

const CSV_URLS = {
  submissions: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=0&single=true&output=csv",
  votes:       "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=269850880&single=true&output=csv",
  rounds:      "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=1154951518&single=true&output=csv",
  competitors: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=826541960&single=true&output=csv"
};

// ── Helpers ────────────────────────────────────────────────────────────────

const clean    = s => String(s ?? '').replace(/^\uFEFF/, '').trim();
const cleanLC  = s => clean(s).toLowerCase();
const num      = s => Number(s ?? 0) || 0;

function getVal(obj, hint) {
  if (!obj) return '';
  const h = cleanLC(hint);
  const keys = Object.keys(obj);
  const exact = keys.find(k => cleanLC(k) === h);
  if (exact !== undefined) return clean(obj[exact]);
  const fuzzy = keys.find(k => cleanLC(k).includes(h));
  return fuzzy !== undefined ? clean(obj[fuzzy]) : '';
}

async function fetchCSV(url) {
  const res  = await fetch(url);
  const text = await res.text();
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function ptsClass(p) {
  const n = num(p);
  if (n > 0) return 'vote-pts-pos';
  if (n < 0) return 'vote-pts-neg';
  return 'vote-pts-zer';
}

function scoreClass(p) {
  const n = num(p);
  if (n >= 20) return 'score-high';
  if (n <= 0)  return 'score-low';
  return 'score-mid';
}

function medal(i) {
  if (i === 0) return '<span class="medal-1">🥇</span>';
  if (i === 1) return '<span class="medal-2">🥈</span>';
  if (i === 2) return '<span class="medal-3">🥉</span>';
  return `<span class="hof-rank">${i + 1}</span>`;
}

// ── Data cache ─────────────────────────────────────────────────────────────

let DATA = null;

async function loadData() {
  if (DATA) return DATA;
  const [subs, vts, rnds, comps] = await Promise.all([
    fetchCSV(CSV_URLS.submissions),
    fetchCSV(CSV_URLS.votes),
    fetchCSV(CSV_URLS.rounds),
    fetchCSV(CSV_URLS.competitors)
  ]);

  // Build lookup maps
  const playerMap = {};   // id → name (de-duped across leagues)
  comps.forEach(c => {
    const id = clean(getVal(c,'ID'));
    if (id && !playerMap[id]) playerMap[id] = clean(getVal(c,'Name'));
  });

  // Unique player names (for autocomplete)
  const uniquePlayers = [...new Set(Object.values(playerMap))].sort((a,b) => a.localeCompare(b));

  // Augment votes with total points per submission URI
  const votesByURI = {};
  vts.forEach(v => {
    const uri = clean(getVal(v,'Spotify URI'));
    if (!votesByURI[uri]) votesByURI[uri] = [];
    votesByURI[uri].push(v);
  });

  const totalPts = {};
  Object.entries(votesByURI).forEach(([uri, vs]) => {
    totalPts[uri] = vs.reduce((acc, v) => acc + num(getVal(v,'Points')), 0);
  });

  // Leagues present
  const leagues = [...new Set(subs.map(s => clean(getVal(s,'League'))))].sort((a,b)=>num(a)-num(b));

  DATA = { subs, vts, rnds, comps, playerMap, uniquePlayers, votesByURI, totalPts, leagues };
  return DATA;
}

// ── Dark mode ──────────────────────────────────────────────────────────────

const dmBtn = document.getElementById('darkToggle');
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
dmBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// ── Tabs ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.dd-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dd-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dd-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PANEL 1 — League Summary
// ══════════════════════════════════════════════════════════════════════════

async function initLeaguePanel() {
  const data = await loadData();
  const sel  = document.getElementById('leagueSelect');

  data.leagues.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = `League ${l}`;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => renderLeague(sel.value));
}

function renderLeague(league) {
  if (!league) return;
  const { subs, rnds, totalPts, playerMap } = DATA;
  const el = document.getElementById('leagueContent');

  const leagueRounds = rnds.filter(r => clean(getVal(r,'League')) === league);
  const leagueSubs   = subs.filter(s => clean(getVal(s,'League')) === league);

  // Stats
  const memberIds = [...new Set(leagueSubs.map(s => clean(getVal(s,'Submitter ID'))))];
  const totalSongs = leagueSubs.length;

  // Round-level stats
  const roundData = leagueRounds.map((r, i) => {
    const rid  = clean(getVal(r,'ID'));
    const roundSubs = leagueSubs.filter(s => clean(getVal(s,'Round ID')) === rid);

    // Winner = highest total points
    let winner = null, winPts = -Infinity;
    roundSubs.forEach(s => {
      const uri = clean(getVal(s,'Spotify URI'));
      const pts = totalPts[uri] ?? 0;
      if (pts > winPts) { winPts = pts; winner = s; }
    });

    const playlistUrl = clean(getVal(r,'Playlist URL'));

    return { r, rid, roundSubs, winner, winPts, playlistUrl, i };
  });

  // League top scorer overall
  let topSong = null, topPts = -Infinity;
  leagueSubs.forEach(s => {
    const pts = totalPts[clean(getVal(s,'Spotify URI'))] ?? 0;
    if (pts > topPts) { topPts = pts; topSong = s; }
  });

  // Build HTML
  let html = `
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">${leagueRounds.length}</div><div class="stat-lbl">Rounds</div></div>
      <div class="stat-box"><div class="stat-val">${totalSongs}</div><div class="stat-lbl">Songs</div></div>
      <div class="stat-box"><div class="stat-val">${memberIds.length}</div><div class="stat-lbl">Members</div></div>
    </div>`;

  if (topSong) {
    const submitterName = playerMap[clean(getVal(topSong,'Submitter ID'))] || 'Unknown';
    const summaryParams = new URLSearchParams({
      song: getVal(topSong,'Title'), artist: getVal(topSong,'Artist(s)'), league
    });
    html += `
    <div class="dd-card" style="border-left:4px solid #f5a623;">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.5;margin:0 0 4px;">⭐ League high score</p>
      <h3 style="margin:0 0 4px;">${esc(getVal(topSong,'Title'))} <span style="font-weight:400;opacity:.7;">by ${esc(getVal(topSong,'Artist(s)'))}</span></h3>
      <p>Submitted by <strong>${esc(submitterName)}</strong> · <span class="score-pill score-high">${topPts} pts</span>
      · <a href="summary.html?${summaryParams}" class="wiki-link">View summary →</a></p>
    </div>`;
  }

  html += `<div class="dd-section-title">Rounds</div>`;

  roundData.forEach(({ r, roundSubs, winner, winPts, playlistUrl, i }) => {
    const name = esc(getVal(r,'Name'));
    const desc = esc(getVal(r,'Description'));
    const winnerName = winner
      ? `${esc(getVal(winner,'Title'))} — ${playerMap[clean(getVal(winner,'Submitter ID'))] || '?'} (${winPts} pts)`
      : '—';

    const playlistLink = playlistUrl
      ? `<a href="${esc(playlistUrl)}" target="_blank" class="playlist-link">▶ Playlist</a>`
      : '';

    const summaryParams = winner ? new URLSearchParams({
      song: getVal(winner,'Title'), artist: getVal(winner,'Artist(s)'), league
    }) : null;

    const winnerLink = winner && summaryParams
      ? `<a href="summary.html?${summaryParams}" class="wiki-link" style="font-size:12px;">${winnerName}</a>`
      : winnerName;

    html += `
    <div class="round-row">
      <span class="round-num">${i + 1}</span>
      <span class="round-name">${name}</span>
      <span class="round-desc">${desc}</span>
      <span class="round-winner">🏆 ${winnerLink}</span>
      ${playlistLink}
    </div>`;
  });

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════════
// PANEL 2 — Member Profile
// ══════════════════════════════════════════════════════════════════════════

async function initMemberPanel() {
  const data = await loadData();
  const input   = document.getElementById('memberInput');
  const suggest = document.getElementById('memberSuggestions');

  function showSuggestions(query) {
    const q = query.toLowerCase().trim();
    if (!q) { suggest.style.display = 'none'; return; }
    const matches = data.uniquePlayers.filter(n => n.toLowerCase().includes(q));
    if (!matches.length) { suggest.style.display = 'none'; return; }
    suggest.innerHTML = matches.slice(0, 12).map(n =>
      `<div class="member-suggestion">${esc(n)}</div>`
    ).join('');
    suggest.style.display = 'block';
    suggest.querySelectorAll('.member-suggestion').forEach(div => {
      div.addEventListener('click', () => {
        input.value = div.textContent;
        suggest.style.display = 'none';
        renderMember(div.textContent.trim());
      });
    });
  }

  input.addEventListener('input',  () => showSuggestions(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { suggest.style.display = 'none'; renderMember(input.value.trim()); }
    if (e.key === 'Escape') suggest.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.member-wrap')) suggest.style.display = 'none';
  });
}

function renderMember(name) {
  if (!name) return;
  const { subs, vts, rnds, playerMap, totalPts, leagues } = DATA;

  // Find all IDs for this name (same person can appear in multiple leagues)
  const memberIds = Object.entries(playerMap)
    .filter(([, n]) => n.toLowerCase() === name.toLowerCase())
    .map(([id]) => id);

  if (!memberIds.length) {
    document.getElementById('memberContent').innerHTML =
      `<p class="dd-empty">No member found matching "${esc(name)}".</p>`;
    return;
  }

  // Their submissions
  const memberSubs = subs.filter(s => memberIds.includes(clean(getVal(s,'Submitter ID'))));

  // Their votes
  const memberVotes = vts.filter(v => memberIds.includes(clean(getVal(v,'Voter ID'))));

  // Leagues they participated in
  const memberLeagues = [...new Set(memberSubs.map(s => clean(getVal(s,'League'))))].sort((a,b)=>num(a)-num(b));

  // Overall stats
  const totalReceived = memberSubs.reduce((acc,s) => acc + (totalPts[clean(getVal(s,'Spotify URI'))] ?? 0), 0);
  const totalGiven    = memberVotes.reduce((acc,v) => acc + num(getVal(v,'Points')), 0);
  const votesWithComment = memberVotes.filter(v => clean(getVal(v,'Comment')));

  // Best and worst submission
  let bestSub = null, bestPts = -Infinity, worstSub = null, worstPts = Infinity;
  memberSubs.forEach(s => {
    const pts = totalPts[clean(getVal(s,'Spotify URI'))] ?? 0;
    if (pts > bestPts)  { bestPts = pts;  bestSub  = s; }
    if (pts < worstPts) { worstPts = pts; worstSub = s; }
  });

  let html = `
    <div class="dd-card">
      <h3>${esc(name)}</h3>
      <p>League${memberLeagues.length > 1 ? 's' : ''}: ${memberLeagues.map(l => `<strong>${l}</strong>`).join(', ')}</p>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">${memberSubs.length}</div><div class="stat-lbl">Songs submitted</div></div>
      <div class="stat-box"><div class="stat-val">${totalReceived}</div><div class="stat-lbl">Points received</div></div>
      <div class="stat-box"><div class="stat-val">${memberVotes.length}</div><div class="stat-lbl">Votes cast</div></div>
      <div class="stat-box"><div class="stat-val">${votesWithComment.length}</div><div class="stat-lbl">Comments left</div></div>
    </div>`;

  // Best / worst
  if (bestSub) {
    const bParams = new URLSearchParams({ song: getVal(bestSub,'Title'), artist: getVal(bestSub,'Artist(s)'), league: getVal(bestSub,'League') });
    const wParams = new URLSearchParams({ song: getVal(worstSub,'Title'), artist: getVal(worstSub,'Artist(s)'), league: getVal(worstSub,'League') });
    html += `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="dd-card" style="flex:1;min-width:200px;border-left:4px solid #22863a;">
        <p style="font-size:11px;text-transform:uppercase;opacity:.5;margin:0 0 4px;">🏆 Best submission</p>
        <h4>${esc(getVal(bestSub,'Title'))}</h4>
        <p>${esc(getVal(bestSub,'Artist(s)'))} · L${getVal(bestSub,'League')} · <span class="score-pill score-high">${bestPts} pts</span>
        · <a href="summary.html?${bParams}" class="wiki-link" style="font-size:12px;">view →</a></p>
      </div>
      <div class="dd-card" style="flex:1;min-width:200px;border-left:4px solid #cb2431;">
        <p style="font-size:11px;text-transform:uppercase;opacity:.5;margin:0 0 4px;">💀 Lowest scoring</p>
        <h4>${esc(getVal(worstSub,'Title'))}</h4>
        <p>${esc(getVal(worstSub,'Artist(s)'))} · L${getVal(worstSub,'League')} · <span class="score-pill score-low">${worstPts} pts</span>
        · <a href="summary.html?${wParams}" class="wiki-link" style="font-size:12px;">view →</a></p>
      </div>
    </div>`;
  }

  // Submissions by league
  html += `<div class="dd-section-title">All Submissions</div>`;
  memberLeagues.forEach(league => {
    const leagueSubs = memberSubs.filter(s => clean(getVal(s,'League')) === league)
      .sort((a,b) => (totalPts[clean(getVal(b,'Spotify URI'))] ?? 0) - (totalPts[clean(getVal(a,'Spotify URI'))] ?? 0));
    html += `<div class="member-league-header">League ${league}</div>`;
    leagueSubs.forEach(s => {
      const pts    = totalPts[clean(getVal(s,'Spotify URI'))] ?? 0;
      const params = new URLSearchParams({ song: getVal(s,'Title'), artist: getVal(s,'Artist(s)'), league });
      const comment = clean(getVal(s,'Comment'));
      html += `
      <div class="round-row">
        <span style="flex:3;">
          <strong>${esc(getVal(s,'Title'))}</strong> <span style="opacity:.65;">by ${esc(getVal(s,'Artist(s)'))}</span>
          ${comment ? `<div class="vote-comment">"${esc(comment)}"</div>` : ''}
        </span>
        <span class="score-pill ${scoreClass(pts)}">${pts} pts</span>
        <a href="summary.html?${params}" class="wiki-link" style="font-size:12px;">view →</a>
      </div>`;
    });
  });

  // Votes/comments given (only show ones with comments, sorted by league)
  if (votesWithComment.length) {
    html += `<div class="dd-section-title" style="margin-top:28px;">Comments Left (${votesWithComment.length})</div>`;
    const commentLeagues = [...new Set(votesWithComment.map(v => clean(getVal(v,'League'))))].sort((a,b)=>num(a)-num(b));
    commentLeagues.forEach(league => {
      const leagueComments = votesWithComment.filter(v => clean(getVal(v,'League')) === league);
      html += `<div class="member-league-header">League ${league}</div>`;
      leagueComments.forEach(v => {
        const uri     = clean(getVal(v,'Spotify URI'));
        const songSub = DATA.subs.find(s => clean(getVal(s,'Spotify URI')) === uri);
        const title   = songSub ? getVal(songSub,'Title')     : '(unknown)';
        const artist  = songSub ? getVal(songSub,'Artist(s)') : '';
        const pts     = num(getVal(v,'Points'));
        const comment = clean(getVal(v,'Comment'));
        const params  = songSub ? new URLSearchParams({ song: title, artist, league }) : null;
        html += `
        <div class="round-row">
          <span style="flex:3;">
            <strong>${esc(title)}</strong> <span style="opacity:.65;">by ${esc(artist)}</span>
            <div class="vote-comment">"${esc(comment)}"</div>
          </span>
          <span class="${ptsClass(pts)}">${pts > 0 ? '+' : ''}${pts} pts</span>
          ${params ? `<a href="summary.html?${params}" class="wiki-link" style="font-size:12px;">view →</a>` : ''}
        </div>`;
      });
    });
  }

  document.getElementById('memberContent').innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════════
// PANEL 3 — Hall of Fame
// ══════════════════════════════════════════════════════════════════════════

function renderHoF() {
  const { subs, vts, playerMap, totalPts, leagues } = DATA;

  // ── Top scoring songs ever ──
  const rankedSongs = [...subs]
    .map(s => ({ s, pts: totalPts[clean(getVal(s,'Spotify URI'))] ?? 0 }))
    .sort((a,b) => b.pts - a.pts);

  // ── Lowest scoring songs ever ──
  const lowestSongs = [...rankedSongs].sort((a,b) => a.pts - b.pts);

  // ── Most controversial (highest standard deviation of votes) ──
  const controversial = subs.map(s => {
    const uri       = clean(getVal(s,'Spotify URI'));
    const songVotes = (DATA.votesByURI[uri] || []).map(v => num(getVal(v,'Points')));
    if (songVotes.length < 3) return { s, spread: 0, votes: songVotes.length };
    const mean   = songVotes.reduce((a,b) => a+b, 0) / songVotes.length;
    const spread = Math.sqrt(songVotes.reduce((a,b) => a + (b-mean)**2, 0) / songVotes.length);
    return { s, spread: Math.round(spread * 10) / 10, votes: songVotes.length };
  }).sort((a,b) => b.spread - a.spread);

  // ── Most prolific submitters (total points received across all leagues) ──
  const submitterPts = {};
  const submitterCount = {};
  subs.forEach(s => {
    const id  = clean(getVal(s,'Submitter ID'));
    const pts = totalPts[clean(getVal(s,'Spotify URI'))] ?? 0;
    submitterPts[id]   = (submitterPts[id]   || 0) + pts;
    submitterCount[id] = (submitterCount[id] || 0) + 1;
  });
  const submitterRank = Object.entries(submitterPts)
    .map(([id, pts]) => ({ name: playerMap[id] || id, pts, songs: submitterCount[id] }))
    .sort((a,b) => b.pts - a.pts);

  function songRow(item, i, showSpread=false) {
    const { s, pts, spread } = item;
    const title    = getVal(s,'Title');
    const artist   = getVal(s,'Artist(s)');
    const league   = clean(getVal(s,'League'));
    const submitter = playerMap[clean(getVal(s,'Submitter ID'))] || '?';
    const params   = new URLSearchParams({ song: title, artist, league });
    const extra    = showSpread
      ? `<span style="font-size:12px;opacity:.6;">spread ±${spread}</span>`
      : `<span class="score-pill ${scoreClass(pts)}">${pts} pts</span>`;
    return `
    <tr>
      <td>${medal(i)}</td>
      <td>
        <strong>${esc(title)}</strong> <span style="opacity:.65;">by ${esc(artist)}</span><br>
        <span style="font-size:12px;opacity:.55;">Submitted by ${esc(submitter)} · League ${esc(league)}</span>
      </td>
      <td>${extra}</td>
      <td><a href="summary.html?${params}" class="wiki-link" style="font-size:12px;">view →</a></td>
    </tr>`;
  }

  function table(rows) {
    return `<table class="hof-table">
      <tbody>${rows}</tbody>
    </table>`;
  }

  let html = '';

  // Top 20
  html += `<div class="dd-card">
    <h3>🏆 Highest Scoring Songs of All Time</h3>
    <p style="font-size:13px;opacity:.65;margin-bottom:12px;">All leagues combined</p>
    ${table(rankedSongs.slice(0,20).map((item,i) => songRow(item,i)))}
  </div>`;

  // Bottom 10
  html += `<div class="dd-card">
    <h3>💀 Lowest Scoring Songs of All Time</h3>
    <p style="font-size:13px;opacity:.65;margin-bottom:12px;">The brave, the bold, the battered</p>
    ${table(lowestSongs.slice(0,10).map((item,i) => songRow(item,i)))}
  </div>`;

  // Most controversial
  html += `<div class="dd-card">
    <h3>⚡ Most Divisive Songs</h3>
    <p style="font-size:13px;opacity:.65;margin-bottom:12px;">Highest spread between positive and negative votes (min. 3 voters)</p>
    ${table(controversial.filter(x=>x.votes>=3).slice(0,15).map((item,i) => songRow(item,i,true)))}
  </div>`;

  // Submitter leaderboard
  html += `<div class="dd-card">
    <h3>🎖️ All-Time Points Leaderboard</h3>
    <p style="font-size:13px;opacity:.65;margin-bottom:12px;">Total points received across all leagues</p>
    <table class="hof-table">
      <thead><tr><th></th><th>Member</th><th>Total pts</th><th>Songs</th><th>Avg</th></tr></thead>
      <tbody>
        ${submitterRank.map((r,i) => `
        <tr>
          <td>${medal(i)}</td>
          <td><strong>${esc(r.name)}</strong></td>
          <td><span class="score-pill score-mid">${r.pts}</span></td>
          <td style="opacity:.65;">${r.songs}</td>
          <td style="opacity:.65;">${(r.pts/r.songs).toFixed(1)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  document.getElementById('hofLoading').style.display = 'none';
  document.getElementById('hofContent').style.display = 'block';
  document.getElementById('hofContent').innerHTML = html;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

(async () => {
  try {
    // Load data once — all panels share it
    await loadData();

    // Init all three panels
    await initLeaguePanel();
    await initMemberPanel();
    renderHoF();

  } catch (err) {
    console.error('Deep Dive load error:', err);
    document.getElementById('hofLoading').textContent = 'Error loading data — check console.';
  }
})();
