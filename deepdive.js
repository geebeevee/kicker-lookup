// deepdive.js — v1.18


const CSV_URLS = {
  submissions: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=0&single=true&output=csv",
  votes:       "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=269850880&single=true&output=csv",
  rounds:      "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=1154951518&single=true&output=csv",
  competitors: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-xIio2pDMRUNEoIfTBE76a4oX-kQlfVDoW3a-HvrOMdTnEG0gakWvZ74GlpTM6GMFKtHYlKgI6Dzp/pub?gid=826541960&single=true&output=csv"
};

// ── COMMENT MODE ──────────────────────────────────────────────────────────
// Set true to show voter comments everywhere they appear, false to hide them.
const SHOW_COMMENTS = false; // COMMENT MODE — set true to show voter comments everywhere

// ── Helpers ────────────────────────────────────────────────────────────────
const clean   = s => String(s ?? '').replace(/^\uFEFF/, '').trim();
const cleanLC = s => clean(s).toLowerCase();
const num     = s => Number(s ?? 0) || 0;
const esc     = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function getVal(obj, hint) {
  if (!obj) return '';
  const h = cleanLC(hint);
  const keys = Object.keys(obj);
  const k = keys.find(k => cleanLC(k) === h) || keys.find(k => cleanLC(k).includes(h));
  return k !== undefined ? clean(obj[k]) : '';
}

function scoreClass(p) {
  const n = num(p);
  if (n >= 20) return 'score-high';
  if (n <= 0)  return 'score-low';
  return 'score-mid';
}
function ptsClass(p) {
  const n = num(p);
  return n > 0 ? 'vote-pts-pos' : n < 0 ? 'vote-pts-neg' : 'vote-pts-zer';
}
function medal(i) {
  if (i === 0) return '<span class="medal-1">🥇</span>';
  if (i === 1) return '<span class="medal-2">🥈</span>';
  if (i === 2) return '<span class="medal-3">🥉</span>';
  return `<span class="hof-rank">${i + 1}</span>`;
}
function avgClass(v) { return v > 0.3 ? 'pos' : v < -0.3 ? 'neg' : 'neu'; }
function resultsTable(rows, heads) {
  return `<table class="hof-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Autocomplete ───────────────────────────────────────────────────────────
function makeAutocomplete(inputId, suggestId, getItems, onSelect) {
  const input   = document.getElementById(inputId);
  const suggest = document.getElementById(suggestId);
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { suggest.style.display = 'none'; return; }
    const matches = getItems().filter(n => n.toLowerCase().includes(q)).slice(0, 14);
    if (!matches.length) { suggest.style.display = 'none'; return; }
    suggest.innerHTML = matches.map(n => `<div class="dd-suggest-item">${esc(n)}</div>`).join('');
    suggest.style.display = 'block';
    suggest.querySelectorAll('.dd-suggest-item').forEach(div => {
      div.addEventListener('click', () => {
        input.value = div.textContent;
        suggest.style.display = 'none';
        onSelect(div.textContent.trim());
      });
    });
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { suggest.style.display = 'none'; onSelect(input.value.trim()); }
    if (e.key === 'Escape') suggest.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest(`#${suggestId}`) && e.target !== input) suggest.style.display = 'none';
  });
}

// ── Data (async CSV fetch from Google Sheets) ──────────────────────────────
let DATA = null;

async function fetchCSV(url) {
  const r = await fetch(url);
  const t = await r.text();
  return Papa.parse(t, { header: true, skipEmptyLines: true }).data;
}

async function loadData() {
  if (DATA) return DATA;
  const [subs, vts, rnds, comps] = await Promise.all([
    fetchCSV(CSV_URLS.submissions), fetchCSV(CSV_URLS.votes),
    fetchCSV(CSV_URLS.rounds),      fetchCSV(CSV_URLS.competitors)
  ]);
  const meta = null;

  const playerMap   = {};
  const nameHistory = {};
  [...comps].sort((a,b) => String(getVal(a,'League')).localeCompare(String(getVal(b,'League')), undefined, {numeric:true})).forEach(c => {
    const id = clean(getVal(c,'ID')), name = clean(getVal(c,'Name'));
    if (!id || !name) return;
    playerMap[id] = name;
    if (!nameHistory[id]) nameHistory[id] = [];
    if (!nameHistory[id].includes(name)) nameHistory[id].push(name);
  });
  const nameAliases = {};
  Object.entries(nameHistory).forEach(([id, names]) => { if (names.length > 1) nameAliases[id] = names; });
  const uniquePlayers = [...new Set(Object.values(playerMap))].sort((a,b) => a.localeCompare(b));

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

  const subByURI = {};
  subs.forEach(s => { subByURI[clean(getVal(s,'Spotify URI'))] = s; });

  const roundNameMap = {};
  rnds.forEach(r => { roundNameMap[clean(getVal(r,'ID'))] = clean(getVal(r,'Name')); });

  const leagues = [...new Set(subs.map(s => clean(getVal(s,'League'))))].sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric:true}));
  const latestLeague = leagues[leagues.length - 1];

  const note = document.getElementById('dataNote');
  if (note) note.textContent = `Data current up to League ${latestLeague}`;

  DATA = { subs, vts, rnds, comps, playerMap, nameHistory, nameAliases,
           uniquePlayers, votesByURI, totalPts, subByURI, roundNameMap, leagues };
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
    opt.value = l; opt.textContent = `League ${l}`;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => renderLeague(sel.value));
}

function renderLeague(league) {
  if (!league) return;
  const { subs, vts, rnds, totalPts, playerMap } = DATA;
  const el = document.getElementById('leagueContent');

  const leagueRounds = rnds.filter(r => clean(getVal(r,'League')) === league);
  const leagueSubs   = subs.filter(s => clean(getVal(s,'League')) === league);
  const leagueVotes  = vts.filter(v  => clean(getVal(v,'League')) === league);
  const memberIds    = [...new Set(leagueSubs.map(s => clean(getVal(s,'Submitter ID'))))];

  let topSong=null, topPts=-Infinity, lowSong=null, lowPts=Infinity;
  leagueSubs.forEach(s => {
    const pts = totalPts[clean(getVal(s,'Spotify URI'))] ?? 0;
    if (pts > topPts) { topPts=pts; topSong=s; }
    if (pts < lowPts) { lowPts=pts; lowSong=s; }
  });

  const subPts = {}, subCount = {};
  leagueSubs.forEach(s => {
    const id  = clean(getVal(s,'Submitter ID'));
    const pts = totalPts[clean(getVal(s,'Spotify URI'))] ?? 0;
    subPts[id]   = (subPts[id]  ||0) + pts;
    subCount[id] = (subCount[id]||0) + 1;
  });
  const leagueLeaderboard = Object.entries(subPts)
    .map(([id,pts]) => ({ name: playerMap[id]||id, pts, songs: subCount[id] }))
    .sort((a,b)=>b.pts-a.pts).slice(0,3);

  let html = `<div class="stat-row">
    <div class="stat-box"><div class="stat-val">${leagueRounds.length}</div><div class="stat-lbl">Rounds</div></div>
    <div class="stat-box"><div class="stat-val">${leagueSubs.length}</div><div class="stat-lbl">Songs</div></div>
    <div class="stat-box"><div class="stat-val">${memberIds.length}</div><div class="stat-lbl">Members</div></div>
  </div>`;

  if (leagueLeaderboard.length) {
    const podium = leagueLeaderboard.map((r,i)=>`
      <div style="flex:1;text-align:center;padding:10px;">
        <div style="font-size:24px;">${['🥇','🥈','🥉'][i]}</div>
        <div style="font-weight:700;font-size:14px;">${esc(r.name)}</div>
        <div style="opacity:.6;font-size:12px;">${r.pts} pts · ${r.songs} songs</div>
      </div>`).join('');
    html += `<div class="dd-card" style="margin-bottom:14px;">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.5;margin:0 0 10px;">🏆 League ${league} Top Scorers</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${podium}</div>
    </div>`;
  }

  function songCard(s, pts, label, borderColor, pillClass) {
    if (!s) return '';
    const name   = playerMap[clean(getVal(s,'Submitter ID'))]||'?';
    const params = new URLSearchParams({song:getVal(s,'Title'),artist:getVal(s,'Artist(s)'),league});
    return `<div class="dd-card" style="flex:1;min-width:200px;border-left:4px solid ${borderColor};">
      <p style="font-size:11px;text-transform:uppercase;opacity:.5;margin:0 0 4px;">${label}</p>
      <h4 style="margin:0 0 4px;"><a href="summary.html?${params}" class="wiki-link">${esc(getVal(s,'Title'))}</a></h4>
      <p style="margin:0;font-size:13px;">${esc(getVal(s,'Artist(s)'))} · ${esc(name)} · <span class="score-pill ${pillClass}">${pts} pts</span></p>
    </div>`;
  }
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
    ${songCard(topSong,topPts,'⭐ Highest scoring song','#f5a623','score-high')}
    ${songCard(lowSong,lowPts,'💀 Lowest scoring song','#cb2431','score-low')}
  </div>`;

  html += `<div class="dd-section-title">Rounds — click a round name to see full scoreboard</div>
  <div class="rounds-grid-header">
    <span class="rg-num">#</span><span class="rg-name">Round</span>
    <span class="rg-desc">Theme</span><span class="rg-winner">🏆 Winner</span><span class="rg-link"></span>
  </div>`;

  leagueRounds.forEach((r,i) => {
    const rid       = clean(getVal(r,'ID'));
    const sbId      = `sb-${rid}`;
    const roundSubs = leagueSubs.filter(s => clean(getVal(s,'Round ID'))===rid);
    let winner=null, winPts=-Infinity;
    roundSubs.forEach(s => {
      const pts=totalPts[clean(getVal(s,'Spotify URI'))]??0;
      if(pts>winPts){winPts=pts;winner=s;}
    });
    const playlistUrl = clean(getVal(r,'Playlist URL'));
    const plLink = playlistUrl?`<a href="${esc(playlistUrl)}" target="_blank" class="playlist-link" onclick="event.stopPropagation()">▶ Playlist</a>`:'';
    let winHtml = '—';
    if (winner) {
      const wParams = new URLSearchParams({song:getVal(winner,'Title'),artist:getVal(winner,'Artist(s)'),league});
      const wName   = playerMap[clean(getVal(winner,'Submitter ID'))]||'?';
      winHtml = `<a href="summary.html?${wParams}" class="wiki-link" style="font-size:12px;" onclick="event.stopPropagation()">
        ${esc(getVal(winner,'Title'))} by ${esc(getVal(winner,'Artist(s)'))} — ${esc(wName)} (${winPts} pts)</a>`;
    }
    const sbRows = [...roundSubs]
      .map(s=>({s,pts:totalPts[clean(getVal(s,'Spotify URI'))]??0}))
      .sort((a,b)=>b.pts-a.pts)
      .map(({s,pts},pos)=>{
        const title=getVal(s,'Title'),artist=getVal(s,'Artist(s)');
        const sub=playerMap[clean(getVal(s,'Submitter ID'))]||'?';
        const p=new URLSearchParams({song:title,artist,league});
        const pc=pts>=20?'score-high':pts<=0?'score-low':'score-mid';
        return `<tr><td class="sb-pos">${pos+1}</td><td><a href="summary.html?${p}" class="wiki-link">${esc(title)}</a></td><td style="opacity:.65;">${esc(artist)}</td><td style="opacity:.65;">${esc(sub)}</td><td><span class="score-pill ${pc}">${pts}</span></td></tr>`;
      }).join('');

    html += `
    <div class="rounds-grid-row" onclick="toggleScoreboard('${sbId}')">
      <span class="rg-num">${i+1}</span>
      <span class="rg-name">${esc(getVal(r,'Name'))} <span class="rg-arrow">▼</span></span>
      <span class="rg-desc">${esc(getVal(r,'Description'))}</span>
      <span class="rg-winner">${winHtml}</span>
      <span class="rg-link">${plLink}</span>
    </div>
    <div class="round-scoreboard" id="${sbId}">
      ${resultsTable(sbRows,'<th style="width:32px;">#</th><th>Song</th><th>Artist</th><th>Submitted by</th><th>Score</th>')}
    </div>`;
  });

  html += buildLeagueMemberStats(league, leagueSubs, leagueVotes, playerMap);
  el.innerHTML = html;
}

function toggleScoreboard(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

function buildLeagueMemberStats(league, leagueSubs, leagueVotes, playerMap) {
  const uriSubmitter = {};
  leagueSubs.forEach(s => { uriSubmitter[clean(getVal(s,'Spotify URI'))]=clean(getVal(s,'Submitter ID')); });

  const pairPts={}, pairCount={};
  leagueVotes.forEach(v => {
    const voterId=clean(getVal(v,'Voter ID')), uri=clean(getVal(v,'Spotify URI'));
    const submitterId=uriSubmitter[uri];
    if(!submitterId||voterId===submitterId) return;
    const key=`${voterId}|${submitterId}`;
    pairPts[key]  =(pairPts[key]  ||0)+num(getVal(v,'Points'));
    pairCount[key]=(pairCount[key]||0)+1;
  });
  const pairEntries=Object.entries(pairPts)
    .filter(([key])=>(pairCount[key]||0)>=3)
    .map(([key,pts])=>{const[vid,sid]=key.split('|');return{voter:playerMap[vid]||vid,submitter:playerMap[sid]||sid,pts,count:pairCount[key]};});
  const topFans=[...pairEntries].sort((a,b)=>b.pts-a.pts).slice(0,10);
  const notForMe=[...pairEntries].sort((a,b)=>a.pts-b.pts).slice(0,10);

  const grpMap={};
  leagueVotes.forEach(v=>{
    const key=`${clean(getVal(v,'Round ID'))}|${clean(getVal(v,'Spotify URI'))}`;
    if(!grpMap[key]) grpMap[key]={sum:0,count:0};
    grpMap[key].sum+=num(getVal(v,'Points')); grpMap[key].count+=1;
  });
  const memberDevs={}, memberVoteCounts={};
  leagueVotes.forEach(v=>{
    const voterId=clean(getVal(v,'Voter ID'));
    const key=`${clean(getVal(v,'Round ID'))}|${clean(getVal(v,'Spotify URI'))}`;
    const grp=grpMap[key];
    if(!grp||grp.count<3) return;
    const myPts=num(getVal(v,'Points')), othersMean=(grp.sum-myPts)/(grp.count-1);
    if(!memberDevs[voterId]){memberDevs[voterId]=0;memberVoteCounts[voterId]=0;}
    memberDevs[voterId]+=Math.abs(myPts-othersMean); memberVoteCounts[voterId]+=1;
  });
  const memberAvgDevs=Object.entries(memberDevs)
    .filter(([id])=>memberVoteCounts[id]>=10)
    .map(([id,total])=>({id,name:playerMap[id]||id,avg:total/memberVoteCounts[id]}))
    .sort((a,b)=>a.avg-b.avg);
  const herd=memberAvgDevs.slice(0,7);
  const wolves=[...memberAvgDevs].reverse().slice(0,7);

  function devRows(items,emoji){return items.map((item,i)=>`<tr><td>${medal(i)}</td><td>${emoji} <strong>${esc(item.name)}</strong></td><td style="opacity:.6;font-size:12px;">avg deviation ${item.avg.toFixed(2)}</td></tr>`).join('');}
  function fanRows(items){return items.map((item,i)=>{const cls=item.pts>=0?'vote-pts-pos':'vote-pts-neg';return`<tr><td>${medal(i)}</td><td><strong>${esc(item.voter)}</strong></td><td style="opacity:.65;">→ ${esc(item.submitter)}</td><td><span class="${cls}" style="font-weight:700;">${item.pts>0?'+':''}${item.pts} pts</span></td><td style="opacity:.5;font-size:12px;">${item.count} songs</td></tr>`;}).join('');}

  if(!topFans.length&&!herd.length) return '';
  return `<div class="dd-section-title" style="margin-top:28px;">League ${league} — Member Stats</div>
  <div class="member-stats-grid">
    <div class="ms-card"><h4>🐑 Vote With The Herd</h4><p style="font-size:12px;opacity:.6;margin-bottom:8px;">Closest to group consensus this league</p>${resultsTable(devRows(herd,'🐑'),'<th></th><th>Member</th><th>Avg deviation</th>')}</div>
    <div class="ms-card"><h4>🐺 Lone Wolves</h4><p style="font-size:12px;opacity:.6;margin-bottom:8px;">Most diverged from group consensus</p>${resultsTable(devRows(wolves,'🐺'),'<th></th><th>Member</th><th>Avg deviation</th>')}</div>
    <div class="ms-card"><h4>❤️ I'm Your Biggest Fan</h4><p style="font-size:12px;opacity:.6;margin-bottom:8px;">Most total points given to one person's songs (min 3 songs)</p>${resultsTable(fanRows(topFans),'<th></th><th>Voter</th><th>→ Artist</th><th>Total</th><th>Songs</th>')}</div>
    <div class="ms-card"><h4>💔 Not For Me</h4><p style="font-size:12px;opacity:.6;margin-bottom:8px;">Lowest total points given to one person's songs (min 3 songs)</p>${resultsTable(fanRows(notForMe),'<th></th><th>Voter</th><th>→ Artist</th><th>Total</th><th>Songs</th>')}</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// PANEL 2 — Member Profile
// ══════════════════════════════════════════════════════════════════════════
async function initMemberPanel() {
  const data = await loadData();
  makeAutocomplete('memberInput','memberSuggestions', ()=>data.uniquePlayers, renderMember);
}

function getMemberIds(name) {
  return Object.entries(DATA.playerMap).filter(([,n])=>n.toLowerCase()===name.toLowerCase()).map(([id])=>id);
}

function renderMember(name) {
  if (!name) return;
  const { subs, vts, totalPts, playerMap, nameHistory, rnds, roundNameMap } = DATA;
  const memberIds = getMemberIds(name);
  if (!memberIds.length) {
    document.getElementById('memberContent').innerHTML=`<p class="dd-empty">No member found matching "${esc(name)}".</p>`;
    return;
  }
  const allAliasNames=[...new Set(memberIds.flatMap(id=>nameHistory[id]||[]))];
  const aliasHtml=allAliasNames.length>1
    ?allAliasNames.filter(n=>n!==name).map(n=>`<span class="alias-badge">also known as: ${esc(n)}</span>`).join(' '):'';

  const memberSubs=subs.filter(s=>memberIds.includes(clean(getVal(s,'Submitter ID'))));
  const memberVotes=vts.filter(v=>memberIds.includes(clean(getVal(v,'Voter ID'))));
  const memberLeagues=[...new Set(memberSubs.map(s=>clean(getVal(s,'League'))))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
  const totalReceived=memberSubs.reduce((acc,s)=>acc+(totalPts[clean(getVal(s,'Spotify URI'))]??0),0);

  let bestSub=null,bestPts=-Infinity,worstSub=null,worstPts=Infinity;
  memberSubs.forEach(s=>{
    const pts=totalPts[clean(getVal(s,'Spotify URI'))]??0;
    if(pts>bestPts){bestPts=pts;bestSub=s;}
    if(pts<worstPts){worstPts=pts;worstSub=s;}
  });

  const allSubPts={};
  subs.forEach(s=>{const id=clean(getVal(s,'Submitter ID'));const pts=totalPts[clean(getVal(s,'Spotify URI'))]??0;allSubPts[id]=(allSubPts[id]||0)+pts;});
  const ranked=Object.values(allSubPts).sort((a,b)=>b-a);
  const myTotalPts=memberIds.reduce((acc,id)=>acc+(allSubPts[id]||0),0);
  const myRank=ranked.findIndex(p=>p<=myTotalPts)+1;
  const maxPts=Math.max(...memberSubs.map(s=>Math.abs(totalPts[clean(getVal(s,'Spotify URI'))]??0)),1);

  let html=`<div class="dd-card"><h3>${esc(name)} ${aliasHtml}</h3><p>League${memberLeagues.length>1?'s':''}: ${memberLeagues.map(l=>`<strong>${l}</strong>`).join(', ')}</p></div>
  <div class="stat-row">
    <div class="stat-box"><div class="stat-val">${memberSubs.length}</div><div class="stat-lbl">Songs submitted</div></div>
    <div class="stat-box"><div class="stat-val">${totalReceived}</div><div class="stat-lbl">Points received</div></div>
    <div class="stat-box"><div class="stat-val">#${myRank}</div><div class="stat-lbl">All-time rank</div></div>
    <div class="stat-box"><div class="stat-val">${memberVotes.length}</div><div class="stat-lbl">Votes cast</div></div>
  </div>`;

  if(bestSub&&worstSub){
    const bP=new URLSearchParams({song:getVal(bestSub,'Title'),artist:getVal(bestSub,'Artist(s)'),league:getVal(bestSub,'League')});
    const wP=new URLSearchParams({song:getVal(worstSub,'Title'),artist:getVal(worstSub,'Artist(s)'),league:getVal(worstSub,'League')});
    html+=`<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="dd-card" style="flex:1;min-width:200px;border-left:4px solid #22863a;">
        <p style="font-size:11px;text-transform:uppercase;opacity:.5;margin:0 0 4px;">🏆 Best submission</p>
        <h4><a href="summary.html?${bP}" class="wiki-link">${esc(getVal(bestSub,'Title'))}</a></h4>
        <p>${esc(getVal(bestSub,'Artist(s)'))} · L${getVal(bestSub,'League')} · <span class="score-pill score-high">${bestPts} pts</span></p>
      </div>
      <div class="dd-card" style="flex:1;min-width:200px;border-left:4px solid #cb2431;">
        <p style="font-size:11px;text-transform:uppercase;opacity:.5;margin:0 0 4px;">💀 Lowest scoring</p>
        <h4><a href="summary.html?${wP}" class="wiki-link">${esc(getVal(worstSub,'Title'))}</a></h4>
        <p>${esc(getVal(worstSub,'Artist(s)'))} · L${getVal(worstSub,'League')} · <span class="score-pill score-low">${worstPts} pts</span></p>
      </div>
    </div>`;
  }

  html+=`<div class="dd-section-title">Submission History</div>`;
  [...memberSubs].sort((a,b)=>String(getVal(a,'League')).localeCompare(String(getVal(b,'League')),undefined,{numeric:true})).forEach(s=>{
    const pts=totalPts[clean(getVal(s,'Spotify URI'))]??0;
    const params=new URLSearchParams({song:getVal(s,'Title'),artist:getVal(s,'Artist(s)'),league:getVal(s,'League')});
    const barW=Math.round((Math.abs(pts)/maxPts)*100);
    html+=`<div class="timeline-row">
      <span class="tl-league">L${esc(getVal(s,'League'))}</span>
      <span class="tl-title"><a href="summary.html?${params}" class="wiki-link"><strong>${esc(getVal(s,'Title'))}</strong></a>
        <span style="opacity:.6;font-size:12px;"> ${esc(getVal(s,'Artist(s)'))}</span>
      </span>
      <div class="tl-bar-wrap"><div class="${pts>=0?'tl-bar-pos':'tl-bar-neg'}" style="width:${barW}%"></div></div>
      <span class="tl-pts ${scoreClass(pts)}">${pts}</span>
    </div>`;
  });

  if(memberVotes.length){
    const roundOrderMap={};
    rnds.forEach((r,i)=>{roundOrderMap[clean(getVal(r,'ID'))]=i;});
    const sortedVotes=[...memberVotes].sort((a,b)=>{
      const la=String(getVal(a,'League')),lb=String(getVal(b,'League'));
      const lcmp=la.localeCompare(lb,undefined,{numeric:true}); if(lcmp!==0) return lcmp;
      return (roundOrderMap[clean(getVal(a,'Round ID'))]??999)-(roundOrderMap[clean(getVal(b,'Round ID'))]??999);
    });
    const voteRows=sortedVotes.map(v=>{
      const uri=clean(getVal(v,'Spotify URI')),sub=DATA.subByURI[uri];
      const title=sub?getVal(sub,'Title'):'(unknown)',artist=sub?getVal(sub,'Artist(s)'):'';
      const submitter=sub?(playerMap[clean(getVal(sub,'Submitter ID'))]||'?'):'?';
      const vLeague=clean(getVal(v,'League')),vRoundId=clean(getVal(v,'Round ID'));
      const roundName=roundNameMap[vRoundId]||'—';
      const pts=num(getVal(v,'Points'));
      const params=sub?new URLSearchParams({song:title,artist,league:vLeague}):null;
      const pillClass=pts>=4?'score-high':pts<=0?'score-low':'score-mid';
      // COMMENT MODE — shown only when SHOW_COMMENTS = true
      const comment = SHOW_COMMENTS ? getVal(v,'Comment') : '';
      const commentHtml = SHOW_COMMENTS && comment
        ? `<br><small style="opacity:.65;font-style:italic;">"${esc(comment)}"</small>` : '';
      return `<tr>
        <td>${params?`<a href="summary.html?${params}" class="wiki-link">${esc(title)}</a>`:esc(title)}${commentHtml}</td>
        <td style="opacity:.65;">${esc(artist)}</td>
        <td style="opacity:.65;">${esc(submitter)}</td>
        <td><span class="score-pill ${pillClass}">${pts}</span></td>
        <td style="opacity:.5;font-size:12px;">${esc(vLeague)}</td>
        <td style="opacity:.5;font-size:12px;">${esc(roundName)}</td>
      </tr>`;
    }).join('');
    html+=`<div class="dd-section-title" style="margin-top:28px;">Scoring History (${memberVotes.length} votes cast)</div>
    ${resultsTable(voteRows,'<th>Song</th><th>Artist</th><th>Submitted by</th><th>Score</th><th>League</th><th>Round</th>')}`;
  }
  document.getElementById('memberContent').innerHTML=html;
}

// ══════════════════════════════════════════════════════════════════════════
// PANEL 3 — Hall of Fame
// ══════════════════════════════════════════════════════════════════════════
function renderHoF() {
  const { subs, votesByURI, totalPts, playerMap } = DATA;
  const ranked=[...subs].map(s=>({s,pts:totalPts[clean(getVal(s,'Spotify URI'))]??0})).sort((a,b)=>b.pts-a.pts);
  const controversial=subs.map(s=>{
    const uri=clean(getVal(s,'Spotify URI')),vs=(votesByURI[uri]||[]).map(v=>num(getVal(v,'Points')));
    if(vs.length<3) return null;
    const mean=vs.reduce((a,b)=>a+b,0)/vs.length;
    const std=Math.sqrt(vs.reduce((a,b)=>a+(b-mean)**2,0)/vs.length);
    return{s,spread:Math.round(std*10)/10,totalPts:totalPts[uri]??0};
  }).filter(Boolean).sort((a,b)=>b.spread-a.spread);

  function songRow(s,pts,i,extra=''){
    const title=getVal(s,'Title'),artist=getVal(s,'Artist(s)'),league=clean(getVal(s,'League'));
    const subName=playerMap[clean(getVal(s,'Submitter ID'))]||'?';
    const params=new URLSearchParams({song:title,artist,league});
    return `<tr><td>${medal(i)}</td><td>
      <a href="summary.html?${params}" class="wiki-link"><strong>${esc(title)}</strong></a>
      <span style="opacity:.65;"> by ${esc(artist)}</span><br>
      <span style="font-size:12px;opacity:.55;">Submitted by ${esc(subName)} · League ${esc(league)}</span>
    </td><td>${extra||`<span class="score-pill ${scoreClass(pts)}">${pts} pts</span>`}</td></tr>`;
  }

  const html=`
  <div class="dd-card"><h3>🏆 Highest Scoring Songs of All Time</h3><p style="font-size:13px;opacity:.65;margin-bottom:12px;">All leagues combined</p>
    ${resultsTable(ranked.slice(0,20).map(({s,pts},i)=>songRow(s,pts,i)).join(''),'<th></th><th>Song</th><th>Score</th>')}
  </div>
  <div class="dd-card"><h3>💀 Lowest Scoring Songs of All Time</h3><p style="font-size:13px;opacity:.65;margin-bottom:12px;">The brave, the bold, the battered</p>
    ${resultsTable([...ranked].reverse().slice(0,10).map(({s,pts},i)=>songRow(s,pts,i)).join(''),'<th></th><th>Song</th><th>Score</th>')}
  </div>
  <div class="dd-card"><h3>⚡ Most Divisive Songs</h3><p style="font-size:13px;opacity:.65;margin-bottom:12px;">Highest spread between positive and negative votes (min. 3 voters)</p>
    ${resultsTable(controversial.slice(0,15).map(({s,spread,totalPts:tp},i)=>songRow(s,tp,i,
      `<span style="font-size:12px;opacity:.7;">spread ±${spread}</span> <span class="score-pill ${scoreClass(tp)}">${tp} pts</span>`
    )).join(''),'<th></th><th>Song</th><th>Spread / Score</th>')}
  </div>`;

  document.getElementById('hofLoading').style.display='none';
  document.getElementById('hofContent').style.display='block';
  document.getElementById('hofContent').innerHTML=html;
}

// ══════════════════════════════════════════════════════════════════════════
// PANEL 4 — Head-to-Head
// ══════════════════════════════════════════════════════════════════════════
async function initH2HPanel() {
  const data=await loadData();
  const getPlayers=()=>data.uniquePlayers;
  let chosen={a:null,b:null};
  makeAutocomplete('h2hInput1','h2hSuggest1',getPlayers,name=>{chosen.a=name;tryRenderH2H(chosen);});
  makeAutocomplete('h2hInput2','h2hSuggest2',getPlayers,name=>{chosen.b=name;tryRenderH2H(chosen);});
}
function tryRenderH2H({a,b}){
  if(!a||!b) return;
  if(a.toLowerCase()===b.toLowerCase()){document.getElementById('h2hContent').innerHTML=`<p class="dd-empty">Pick two different members.</p>`;return;}
  renderH2H(a,b);
}
function renderH2H(nameA,nameB){
  const{subs,vts,subByURI}=DATA;
  const idsA=getMemberIds(nameA),idsB=getMemberIds(nameB);
  if(!idsA.length||!idsB.length){document.getElementById('h2hContent').innerHTML=`<p class="dd-empty">Could not find one or both members.</p>`;return;}
  const subsA=subs.filter(s=>idsA.includes(clean(getVal(s,'Submitter ID'))));
  const subsB=subs.filter(s=>idsB.includes(clean(getVal(s,'Submitter ID'))));
  const urisA=new Set(subsA.map(s=>clean(getVal(s,'Spotify URI'))));
  const urisB=new Set(subsB.map(s=>clean(getVal(s,'Spotify URI'))));
  const aOnB=vts.filter(v=>idsA.includes(clean(getVal(v,'Voter ID')))&&urisB.has(clean(getVal(v,'Spotify URI'))));
  const bOnA=vts.filter(v=>idsB.includes(clean(getVal(v,'Voter ID')))&&urisA.has(clean(getVal(v,'Spotify URI'))));
  const avgAonB=aOnB.length?aOnB.reduce((acc,v)=>acc+num(getVal(v,'Points')),0)/aOnB.length:null;
  const avgBonA=bOnA.length?bOnA.reduce((acc,v)=>acc+num(getVal(v,'Points')),0)/bOnA.length:null;
  const sharedLeagues=[...new Set(subsA.map(s=>clean(getVal(s,'League'))))].filter(l=>[...new Set(subsB.map(s=>clean(getVal(s,'League'))))].includes(l)).sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));

  function avgDisplay(val,label){
    if(val===null) return`<div class="h2h-avg neu">—</div><p style="opacity:.6;font-size:13px;">No shared leagues</p>`;
    return`<div class="h2h-avg ${avgClass(val)}">${val>0?'+':''}${val.toFixed(2)}</div><p style="opacity:.65;font-size:13px;">${label}</p>`;
  }
  let html=`<div class="dd-card" style="margin-bottom:14px;"><p style="opacity:.6;font-size:13px;">Shared leagues: ${sharedLeagues.length?sharedLeagues.map(l=>`<strong>L${l}</strong>`).join(', '):'None'}</p></div>
  <div class="h2h-grid">
    <div class="h2h-card"><h4>${esc(nameA)} → ${esc(nameB)}'s songs</h4>${avgDisplay(avgAonB,`avg pts across ${aOnB.length} vote${aOnB.length!==1?'s':''}`)}</div>
    <div class="h2h-card"><h4>${esc(nameB)} → ${esc(nameA)}'s songs</h4>${avgDisplay(avgBonA,`avg pts across ${bOnA.length} vote${bOnA.length!==1?'s':''}`)}</div>
  </div>`;

  function voteTable(votes,label){
    if(!votes.length) return '';
    const rows=[...votes].sort((a,b)=>num(getVal(b,'Points'))-num(getVal(a,'Points'))).map(v=>{
      const uri=clean(getVal(v,'Spotify URI')),sub=subByURI[uri];
      const title=sub?getVal(sub,'Title'):'(unknown)',artist=sub?getVal(sub,'Artist(s)'):'',league=sub?clean(getVal(sub,'League')):'';
      const pts=num(getVal(v,'Points'));
      const params=sub?new URLSearchParams({song:title,artist,league}):null;
      const pillClass=pts>=4?'score-high':pts<=0?'score-low':'score-mid';
      // COMMENT MODE — voter comment in H2H table when SHOW_COMMENTS = true
      const comment = SHOW_COMMENTS ? getVal(v,'Comment') : '';
      const commentHtml = SHOW_COMMENTS && comment
        ? `<br><small style="opacity:.65;font-style:italic;">"${esc(comment)}"</small>` : '';
      return `<tr>
        <td>${params?`<a href="summary.html?${params}" class="wiki-link"><strong>${esc(title)}</strong></a>`:esc(title)}${commentHtml}</td>
        <td style="opacity:.65;">${esc(artist)}</td>
        <td style="opacity:.5;font-size:12px;">L${esc(league)}</td>
        <td><span class="score-pill ${pillClass}">${pts}</span></td>
      </tr>`;
    }).join('');
    return`<div class="dd-section-title" style="margin-top:24px;">${label}</div>
      ${resultsTable(rows,'<th>Song</th><th>Artist</th><th>League</th><th>Score</th>')}`;
  }
  html+=voteTable(aOnB,`${esc(nameA)}'s votes on ${esc(nameB)}'s songs`);
  html+=voteTable(bOnA,`${esc(nameB)}'s votes on ${esc(nameA)}'s songs`);
  document.getElementById('h2hContent').innerHTML=html;
}

// ══════════════════════════════════════════════════════════════════════════
// PANEL 5 — Artist Stats
// ══════════════════════════════════════════════════════════════════════════
function renderArtistStats(){
  const{subs,totalPts}=DATA;
  const artistData={};
  subs.forEach(s=>{
    const artist=clean(getVal(s,'Artist(s)')),uri=clean(getVal(s,'Spotify URI'));
    if(!artist) return;
    if(!artistData[artist]) artistData[artist]={uris:new Set(),subs:[],leagues:new Set()};
    artistData[artist].uris.add(uri);artistData[artist].subs.push(s);artistData[artist].leagues.add(clean(getVal(s,'League')));
  });
  const artists=Object.entries(artistData).map(([name,d])=>{
    const uniquePts=[...d.uris].map(uri=>totalPts[uri]??0);
    const totalSum=uniquePts.reduce((a,b)=>a+b,0);
    return{name,count:d.subs.length,uniqueSongs:d.uris.size,pts:totalSum,avg:uniquePts.length?Math.round((totalSum/uniquePts.length)*10)/10:0,leagues:d.leagues.size,subs:d.subs};
  });
  const byCount=[...artists].sort((a,b)=>b.count-a.count);
  const byAvg=[...artists].filter(a=>a.uniqueSongs>=2).sort((a,b)=>b.avg-a.avg);
  const byLow=[...artists].filter(a=>a.uniqueSongs>=2).sort((a,b)=>a.avg-b.avg);
  const maxCount=byCount[0]?.count||1;

  function artistRows(list,showAvg=false){
    return list.slice(0,20).map((a,i)=>{
      const barW=Math.round((a.count/maxCount)*100);
      const subLinks=a.subs.slice(0,3).map(s=>{const p=new URLSearchParams({song:getVal(s,'Title'),artist:a.name,league:getVal(s,'League')});return`<a href="summary.html?${p}" class="wiki-link" style="font-size:12px;">${esc(getVal(s,'Title'))}</a>`;}).join(', ')+(a.subs.length>3?` +${a.subs.length-3} more`:'');
      return`<tr><td>${medal(i)}</td><td><strong>${esc(a.name)}</strong><br><span style="font-size:12px;opacity:.6;">${subLinks}</span>${!showAvg?`<div class="art-bar-wrap"><div class="art-bar" style="width:${barW}%"></div></div>`:''}</td>
      <td>${showAvg?`<span class="score-pill ${scoreClass(a.avg*3)}">${a.avg} avg</span>`:`<span class="score-pill score-mid">${a.count}×</span>`}</td>
      <td style="opacity:.5;font-size:13px;">${a.leagues} league${a.leagues>1?'s':''}</td></tr>`;
    }).join('');
  }

  const html=`
  <div class="dd-card"><h3>🔁 Most Submitted Artists</h3><p style="font-size:13px;opacity:.65;margin-bottom:12px;">Artists entered the most times across all leagues</p>${resultsTable(artistRows(byCount),'<th></th><th>Artist</th><th>Count</th><th>Leagues</th>')}</div>
  <div class="dd-card"><h3>👑 Highest Avg Score (2+ unique songs)</h3><p style="font-size:13px;opacity:.65;margin-bottom:12px;">Averaged across unique songs only</p>${resultsTable(artistRows(byAvg,true),'<th></th><th>Artist</th><th>Avg score</th><th>Leagues</th>')}</div>
  <div class="dd-card"><h3>📉 Lowest Avg Score (2+ unique songs)</h3><p style="font-size:13px;opacity:.65;margin-bottom:12px;">Brave choices that never quite land</p>${resultsTable(artistRows(byLow,true),'<th></th><th>Artist</th><th>Avg score</th><th>Leagues</th>')}</div>`;

  document.getElementById('artistsLoading').style.display='none';
  document.getElementById('artistsContent').style.display='block';
  document.getElementById('artistsContent').innerHTML=html;
}

// ── Bootstrap (async — fetches from Google Sheets) ────────────────────────
(async () => {
  try {
    await loadData();
    await Promise.all([ initLeaguePanel(), initMemberPanel(), initH2HPanel() ]);
    renderHoF();
    renderArtistStats();
  } catch(err) {
    console.error('Deep Dive load error:', err);
    document.getElementById('hofLoading').textContent = 'Error loading data — check console.';
    document.getElementById('artistsLoading').textContent = 'Error loading data.';
  }
})();
