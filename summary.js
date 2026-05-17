// v1.18
// note references to TSV, all switched to CSV for reliability

const TSV_URLS = {
  submissions: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=0&single=true&output=csv",
  votes:       "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=269850880&single=true&output=csv",
  rounds:      "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=1154951518&single=true&output=csv",
  competitors: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=826541960&single=true&output=csv"
};

const params       = new URLSearchParams(window.location.search);
const targetSong   = (params.get('song')   || '').trim();
const targetArtist = (params.get('artist') || '').trim();
const targetLeague = (params.get('league') || '').trim();

const dmBtn = document.getElementById('darkToggle');
if (dmBtn) {
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
  dmBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });
}

const clean = s => String(s ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s*\/\s*/g, '/');

function getVal(obj, keyHint) {
  if (!obj) return '';
  const hint = clean(keyHint);
  const keys = Object.keys(obj);
  const exactKey = keys.find(k => clean(k) === hint);
  if (exactKey !== undefined) return String(obj[exactKey] ?? '').trim();
  const fuzzyKey = keys.find(k => clean(k).includes(hint));
  if (fuzzyKey !== undefined) return String(obj[fuzzyKey] ?? '').trim();
  console.warn(`[getVal] No column matching "${keyHint}" — available:`, keys);
  return '';
}

const cleanURI = uri => String(uri ?? '').split('?')[0].trim();

async function fetchTSV(url) {
  const res  = await fetch(url);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.data.length > 0) {
    console.log(`[CSV gid=${url.split('gid=')[1]?.split('&')[0]}] columns:`, Object.keys(parsed.data[0]));
  }
  return parsed.data;
}

async function initSummary() {
  console.log(`[init] song="${targetSong}" | artist="${targetArtist}" | league="${targetLeague}"`);

  document.getElementById('display-song').textContent   = targetSong;
  document.getElementById('display-artist').textContent = targetArtist;
  document.getElementById('display-league').textContent = targetLeague;

  try {
    const [subs, vts, rnds, plyrs] = await Promise.all([
      fetchTSV(TSV_URLS.submissions),
      fetchTSV(TSV_URLS.votes),
      fetchTSV(TSV_URLS.rounds),
      fetchTSV(TSV_URLS.competitors)
    ]);

    const cleanTarget = clean(targetSong);
    const cleanArtist = clean(targetArtist);
    const cleanLeague = targetLeague.trim();

    const artistMatch = (s) => {
      if (!cleanArtist) return true;
      const a = clean(getVal(s, 'Artist(s)') || getVal(s, 'Artist'));
      return a.includes(cleanArtist) || cleanArtist.includes(a);
    };

    let submission = subs.find(s =>
      String(getVal(s, 'League')).trim() === cleanLeague &&
      clean(getVal(s, 'Title')) === cleanTarget &&
      artistMatch(s)
    );

    if (!submission) {
      submission = subs.find(s =>
        String(getVal(s, 'League')).trim() === cleanLeague &&
        artistMatch(s) && (() => {
          const t = clean(getVal(s, 'Title'));
          return t.includes(cleanTarget) || cleanTarget.includes(t);
        })()
      );
      if (submission) console.log('[match] Title-contains fallback used');
    }

    if (!submission) {
      submission = subs.find(s =>
        String(getVal(s, 'League')).trim() === cleanLeague &&
        clean(getVal(s, 'Title')) === cleanTarget
      );
      if (submission) console.log('[match] Title-only fallback used');
    }

    if (!submission) {
      showPendingMessage();
      return;
    }

    const subRoundID  = String(getVal(submission, 'Round ID')).trim();
    const subURI      = cleanURI(getVal(submission, 'Spotify URI'));
    const subTitle    = clean(getVal(submission, 'Title'));
    const submitterID = String(getVal(submission, 'Submitter ID')).trim();

    const round = rnds.find(r => String(getVal(r, 'ID')).trim() === subRoundID);
    const submitterRow  = plyrs.find(p => String(getVal(p, 'ID')).trim() === submitterID);
    const submitterName = submitterRow ? (getVal(submitterRow, 'Name') || submitterID) : `[ID: ${submitterID}]`;

    const songVotes = vts.filter(v => {
      const vRoundID = String(getVal(v, 'Round ID')).trim();
      if (vRoundID !== subRoundID) return false;
      const vURI = cleanURI(getVal(v, 'Spotify URI') || getVal(v, 'Song Spotify URI'));
      if (subURI && vURI && subURI === vURI) return true;
      const vTitle = clean(getVal(v, 'Song Title') || getVal(v, 'Title'));
      if (subTitle && vTitle) {
        if (vTitle === subTitle) return true;
        if (vTitle.includes(subTitle) || subTitle.includes(vTitle)) return true;
      }
      return false;
    });

    renderPage(submission, round, submitterName, songVotes, plyrs);

  } catch (err) {
    console.error('[init] Fatal error:', err);
    document.getElementById('loading').textContent = 'Error loading data — check the browser console.';
  }
}

function renderPage(sub, rnd, ownerName, votes, allPlayers) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';

  document.getElementById('display-song').textContent      = getVal(sub, 'Title');
  document.getElementById('display-artist').textContent    = getVal(sub, 'Artist(s)') || targetArtist;
  document.getElementById('display-league').textContent    = targetLeague;
  document.getElementById('round-name').textContent        = rnd ? getVal(rnd, 'Name') : 'Unknown Round';
  document.getElementById('round-description').textContent = rnd ? (getVal(rnd, 'Description') || '') : '';
  document.getElementById('sub-song-title').textContent    = getVal(sub, 'Title');
  document.getElementById('sub-owner').textContent         = ownerName;
  document.getElementById('sub-comment').textContent       = getVal(sub, 'Comment') || 'No comment left.';

  const uri = getVal(sub, 'Spotify URI');
  let trackId = null;
  if (uri.includes('track:'))    trackId = uri.split(':').pop().split('?')[0];
  else if (uri.includes('track/')) trackId = uri.split('track/')[1].split('?')[0];

  document.getElementById('spotify-player').innerHTML = trackId
    ? `<iframe src="https://open.spotify.com/embed/track/${trackId}"
         width="100%" height="152" frameBorder="0"
         allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
         style="border-radius:12px;"></iframe>`
    : '<p style="opacity:0.6;font-size:13px;">No Spotify link available.</p>';

  // Votes — clean table, no comments
  const voteList = document.getElementById('vote-list');
  voteList.innerHTML = '';

  if (votes.length === 0) {
    voteList.innerHTML = '<p style="opacity:0.7;">No votes found for this song in the archive.</p>';
    return;
  }

  const sorted = [...votes].sort(
    (a, b) => Number(getVal(b, 'Points') || 0) - Number(getVal(a, 'Points') || 0)
  );

  let totalPoints = 0;
  const rows = sorted.map(v => {
    const voterID   = String(getVal(v, 'Voter ID')).trim();
    const voterRow  = allPlayers.find(p => String(getVal(p, 'ID')).trim() === voterID);
    const voterName = voterRow ? (getVal(voterRow, 'Name') || `[ID: ${voterID}]`) : `[ID: ${voterID}]`;
    const pts = Number(getVal(v, 'Points') || 0);
    totalPoints += pts;
    const pillClass = pts >= 4 ? 'score-high' : pts <= 0 ? 'score-low' : 'score-mid';
    return `<tr>
      <td>${voterName}</td>
      <td><span class="score-pill ${pillClass}">${pts} pt${pts !== 1 ? 's' : ''}</span></td>
    </tr>`;
  }).join('');

  voteList.innerHTML = `
    <table class="vote-table">
      <thead><tr><th>Voter</th><th>Score</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:12px;font-weight:bold;font-size:14px;">
      Total: ${totalPoints} point${totalPoints !== 1 ? 's' : ''} from ${sorted.length} voter${sorted.length !== 1 ? 's' : ''}
    </p>`;
}

function showPendingMessage() {
  document.getElementById('loading').style.display         = 'none';
  document.getElementById('pending-message').style.display = 'block';
  const el = document.getElementById('pending-league');
  if (el) el.textContent = targetLeague;
}

initSummary();
