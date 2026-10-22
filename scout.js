/*!
 * Chess-AI Scout — an OpeningTree-style opening explorer.
 *
 * Loads a player's games from Lichess, Chess.com or a PGN file, then lets you
 * walk an opening tree on a board: how often each move was played and how the
 * player scored with it.
 *
 * Drop-in: add <script src="./scout.js"></script> after the dashboard's inline
 * script. It builds its own modal and replaces openScoutModal().
 * Needs: Chess (chess.js 0.x, already loaded by the dashboard) and the piece
 * images in ./assets/pieces/cburnett/.
 */
(function (root) {
  'use strict';

  /* ════════════════════════════════════════════════════════════════
     CORE — pure logic (no DOM). Exported for tests when run in Node.
  ════════════════════════════════════════════════════════════════ */

  const MAX_PLY = 40; // half-moves stored per game
  const SPEED_GROUPS = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
  const SPEED_LABEL = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', daily: 'Daily' };
  const LICHESS_PERF = {
    bullet: 'ultraBullet,bullet', blitz: 'blitz', rapid: 'rapid',
    classical: 'classical', daily: 'correspondence'
  };

  class ScoutError extends Error {}

  const normSan = s => String(s).replace(/[+#!?]+$/g, '');

  /** Turn PGN movetext into an array of normalized SAN moves. */
  function parseMovetext(text) {
    let t = String(text).replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let prev;
    do { prev = t; t = t.replace(/\([^()]*\)/g, ' '); } while (t !== prev);
    t = t.replace(/\$\d+/g, ' ');
    const out = [];
    for (let tok of t.split(/\s+/)) {
      if (!tok) continue;
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break;
      tok = tok.replace(/^\d+\.+/, '');
      if (!tok) continue;
      tok = tok.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
      tok = normSan(tok);
      if (!tok) continue;
      out.push(tok);
      if (out.length >= MAX_PLY) break;
    }
    return out;
  }

  function makeGame(o) {
    const mine = o.color === 'white';
    const out = o.res === 'd' ? 'D' : ((o.res === 'w') === mine ? 'W' : 'L');
    return {
      src: o.src, id: o.id || null, url: o.url || null, date: o.date || null,
      speed: o.speed || null, rated: o.rated == null ? null : !!o.rated,
      white: o.white, black: o.black, color: o.color, out,
      opp: mine ? o.black : o.white,
      oppElo: (mine ? o.bElo : o.wElo) || null,
      moves: o.moves, opening: o.opening || ''
    };
  }

  function lichessName(p) {
    if (p && p.user && p.user.name) return p.user.name;
    if (p && p.aiLevel) return 'Stockfish level ' + p.aiLevel;
    return 'Anonymous';
  }

  /** One Lichess NDJSON game → game record (or null to skip). */
  function lichessToGame(j, user) {
    if (!j || j.variant !== 'standard' || typeof j.moves !== 'string' || !j.moves) return null;
    if (['created', 'started', 'aborted', 'noStart', 'unknownFinish'].includes(j.status)) return null;
    const me = user.toLowerCase();
    const w = (j.players && j.players.white) || {};
    const b = (j.players && j.players.black) || {};
    const wName = lichessName(w), bName = lichessName(b);
    let color;
    if (wName.toLowerCase() === me) color = 'white';
    else if (bName.toLowerCase() === me) color = 'black';
    else return null;
    const id = typeof j.id === 'string' && /^[A-Za-z0-9]{8,12}$/.test(j.id) ? j.id : null;
    const speed = j.speed === 'ultraBullet' ? 'bullet' : j.speed === 'correspondence' ? 'daily' : j.speed;
    return makeGame({
      src: 'lichess', id, url: id ? 'https://lichess.org/' + id : null,
      date: j.createdAt, speed, rated: j.rated,
      white: wName, black: bName, wElo: w.rating, bElo: b.rating,
      res: j.winner === 'white' ? 'w' : j.winner === 'black' ? 'b' : 'd',
      color, moves: j.moves.split(' ').slice(0, MAX_PLY).map(normSan),
      opening: j.opening && j.opening.name
    });
  }

  function chesscomOpening(pgn) {
    const m = pgn.match(/\[ECOUrl\s+"([^"]+)"\]/);
    if (!m) return '';
    let seg = m[1].split('/').pop() || '';
    try { seg = decodeURIComponent(seg); } catch (e) { /* keep raw */ }
    return seg.replace(/-/g, ' ').replace(/\s\d+\.+.*$/, '').trim();
  }

  /** One Chess.com monthly-archive game → game record (or null to skip). */
  function chesscomToGame(g, user) {
    if (!g || g.rules !== 'chess' || typeof g.pgn !== 'string') return null;
    if (/\[FEN\s+"/.test(g.pgn)) return null;
    const me = user.toLowerCase();
    const w = g.white || {}, b = g.black || {};
    let color;
    if (String(w.username || '').toLowerCase() === me) color = 'white';
    else if (String(b.username || '').toLowerCase() === me) color = 'black';
    else return null;
    const moves = parseMovetext(g.pgn.replace(/^\[.*\]\s*$/gm, ''));
    const url = typeof g.url === 'string' && g.url.startsWith('https://www.chess.com/') ? g.url : null;
    return makeGame({
      src: 'chesscom', url, date: g.end_time ? g.end_time * 1000 : null,
      speed: g.time_class === 'daily' ? 'daily' : (SPEED_GROUPS.includes(g.time_class) ? g.time_class : 'rapid'),
      rated: g.rated, white: w.username || 'White', black: b.username || 'Black',
      wElo: w.rating, bElo: b.rating,
      res: w.result === 'win' ? 'w' : b.result === 'win' ? 'b' : 'd',
      color, moves, opening: chesscomOpening(g.pgn)
    });
  }

  /** Split a PGN file into game records for the named player. */
  function pgnToGames(text, user) {
    const me = user.toLowerCase();
    const chunks = String(text).split(/^(?=\[Event\s)/m);
    const games = [];
    for (const chunk of chunks) {
      const tags = {};
      chunk.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { tags[k] = v; return ''; });
      if (!tags.White || !tags.Black || tags.FEN) continue;
      const res = tags.Result === '1-0' ? 'w' : tags.Result === '0-1' ? 'b' : tags.Result === '1/2-1/2' ? 'd' : null;
      if (!res) continue;
      let color;
      if (tags.White.toLowerCase() === me) color = 'white';
      else if (tags.Black.toLowerCase() === me) color = 'black';
      else continue;
      const moves = parseMovetext(chunk.replace(/^\[.*\]\s*$/gm, ''));
      if (!moves.length) continue;
      const date = Date.parse(String(tags.Date || '').replace(/\./g, '-') + 'T00:00:00Z');
      games.push(makeGame({
        src: 'pgn', date: Number.isFinite(date) ? date : null, white: tags.White, black: tags.Black,
        wElo: parseInt(tags.WhiteElo, 10) || null, bElo: parseInt(tags.BlackElo, 10) || null,
        res, color, moves, opening: tags.Opening || chesscomOpening(chunk)
      }));
    }
    return games;
  }

  /** Does this game pass the user's filters? */
  function acceptGame(g, cfg) {
    if (!g || !g.moves.length || g.color !== cfg.color) return false;
    if (cfg.speeds && g.speed && !cfg.speeds.includes(g.speed)) return false;
    if (cfg.rated === 'rated' && g.rated === false) return false;
    if (cfg.rated === 'casual' && g.rated === true) return false;
    if (cfg.since && g.date && g.date < cfg.since) return false;
    if (cfg.oppMin != null && !(g.oppElo >= cfg.oppMin)) return false;
    if (cfg.oppMax != null && !(g.oppElo <= cfg.oppMax)) return false;
    return true;
  }

  /** Games whose first moves equal `path`. */
  function matchGames(games, path) {
    if (!path.length) return games.slice();
    const out = [];
    outer: for (const g of games) {
      if (g.moves.length < path.length) continue;
      for (let i = 0; i < path.length; i++) if (g.moves[i] !== path[i]) continue outer;
      out.push(g);
    }
    return out;
  }

  function summarize(list) {
    const s = { n: list.length, W: 0, D: 0, L: 0 };
    for (const g of list) s[g.out]++;
    return s;
  }

  /** Next-move table for the games at the current position. */
  function nextMoveStats(matches, ply) {
    const map = new Map();
    for (const g of matches) {
      const san = g.moves[ply];
      if (!san) continue;
      let r = map.get(san);
      if (!r) { r = { san, n: 0, W: 0, D: 0, L: 0 }; map.set(san, r); }
      r.n++; r[g.out]++;
    }
    return [...map.values()].sort((a, b) => b.n - a.n || a.san.localeCompare(b.san));
  }

  /** Opening name shared by most games here (Lichess / Chess.com names differ in depth). */
  function openingLabel(matches, ply) {
    if (ply === 0) return '';
    const named = [];
    for (const g of matches) {
      if (g.opening) named.push(g.opening.replace(/[:,]/g, ' ').split(/\s+/).filter(Boolean));
    }
    if (!named.length) return '';
    const need = Math.ceil(named.length * 0.6);
    const counts = new Map();
    for (const words of named) {
      let key = '';
      for (const w of words) {
        key = key ? key + ' ' + w : w;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    let best = '';
    for (const [k, c] of counts) if (c >= need && k.length > best.length) best = k;
    return best;
  }

  const core = {
    MAX_PLY, normSan, parseMovetext, lichessToGame, chesscomToGame, pgnToGames,
    acceptGame, matchGames, summarize, nextMoveStats, openingLabel, ScoutError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  /* ════════════════════════════════════════════════════════════════
     NETWORK — Lichess / Chess.com / PGN loaders
  ════════════════════════════════════════════════════════════════ */

  const tick = () => new Promise(r => setTimeout(r, 0));

  async function fetchLichess(cfg, onProgress, signal) {
    const perf = cfg.speeds.map(s => LICHESS_PERF[s]).join(',');
    const params = new URLSearchParams({
      max: String(cfg.max), color: cfg.color, perfType: perf,
      moves: 'true', opening: 'true', tags: 'false', clocks: 'false', evals: 'false', ongoing: 'false'
    });
    if (cfg.rated === 'rated') params.set('rated', 'true');
    if (cfg.rated === 'casual') params.set('rated', 'false');
    if (cfg.since) params.set('since', String(cfg.since));
    const url = 'https://lichess.org/api/games/user/' + encodeURIComponent(cfg.username) + '?' + params;

    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/x-ndjson' }, signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ScoutError('Could not reach Lichess. Check your connection and try again.');
    }
    if (res.status === 404) throw new ScoutError('Lichess has no user named "' + cfg.username + '".');
    if (res.status === 429) throw new ScoutError('Lichess is limiting requests. Wait a minute, then load again.');
    if (!res.ok) throw new ScoutError('Lichess returned HTTP ' + res.status + '.');

    const games = [];
    const take = line => {
      line = line.trim();
      if (!line) return;
      let j;
      try { j = JSON.parse(line); } catch (e) { return; }
      const g = lichessToGame(j, cfg.username);
      if (g && acceptGame(g, cfg)) {
        games.push(g);
        if (games.length % 25 === 0) onProgress(games.length);
      }
    };
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) { take(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
      }
      take(buf);
    } else {
      (await res.text()).split('\n').forEach(take);
    }
    onProgress(games.length);
    return games;
  }

  async function chesscomJson(url, signal) {
    let res;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ScoutError('Could not reach Chess.com. Check your connection and try again.');
    }
    if (res.status === 404) throw new ScoutError('Chess.com has no user with that name.');
    if (res.status === 429) throw new ScoutError('Chess.com is limiting requests. Wait a minute, then load again.');
    if (!res.ok) throw new ScoutError('Chess.com returned HTTP ' + res.status + '.');
    return res.json();
  }

  async function fetchChesscom(cfg, onProgress, signal) {
    const base = 'https://api.chess.com/pub/player/' + encodeURIComponent(cfg.username.toLowerCase());
    const archives = await chesscomJson(base + '/games/archives', signal);
    const urls = (archives.archives || [])
      .filter(u => typeof u === 'string' && u.startsWith('https://api.chess.com/pub/player/'))
      .reverse(); // newest month first
    const games = [];
    for (let i = 0; i < urls.length && games.length < cfg.max; i += 3) {
      const batch = urls.slice(i, i + 3);
      const months = await Promise.all(batch.map(u => chesscomJson(u, signal)));
      for (const month of months) {
        const list = (month.games || []).slice().sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
        for (const raw of list) {
          const g = chesscomToGame(raw, cfg.username);
          if (g && acceptGame(g, cfg)) games.push(g);
          if (games.length >= cfg.max) break;
        }
        if (games.length >= cfg.max) break;
      }
      onProgress(games.length);
      if (cfg.since) {
        const m = batch[batch.length - 1].match(/\/(\d{4})\/(\d{2})$/);
        if (m && Date.UTC(+m[1], +m[2], 1) <= cfg.since) break; // month ended before "since"
      }
    }
    return games;
  }

  async function readPgnFile(cfg, onProgress, signal) {
    const file = cfg.file;
    const text = file.text ? await file.text() : await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new ScoutError('Could not read that file.'));
      fr.readAsText(file);
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await tick();
    const games = pgnToGames(text, cfg.username).filter(g => acceptGame(g, cfg)).slice(0, cfg.max);
    onProgress(games.length);
    return games;
  }

  /* ════════════════════════════════════════════════════════════════
     UI
  ════════════════════════════════════════════════════════════════ */

  const STORE_KEY = 'chessAi.scout.prefs';
  const PIECE_DIR = './assets/pieces/cburnett/';
  const GLYPH = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
  };

  const CSS = `
.st-overlay{padding:8px}
#scoutStudio [hidden]{display:none!important}
.modal-box.st-shell{width:min(1500px,100%);max-width:none;height:min(900px,calc(100dvh - 16px));background:#12121b;border-radius:var(--radius-lg)}
.st-shell .modal-header{padding:12px 20px}
.st-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px}
.st-left{display:flex;flex-direction:column;gap:10px;min-height:0;overflow:hidden;padding:12px 16px;border-right:1px solid var(--card-border)}
.st-topbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.st-stage{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 200px;grid-template-rows:minmax(0,1fr);gap:14px}
.st-right{display:flex;flex-direction:column;min-height:0;min-width:0}
.st-opening{flex:1;min-width:0;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:20px;padding:7px 12px;border-radius:var(--radius-sm);background:var(--surface-card);border:1px solid var(--card-border);font-family:'DM Serif Display',Georgia,serif;font-size:18px;color:#f1f5f9}
.st-board-wrap{min-width:0;min-height:0;display:grid;place-items:center}
.st-board{width:min(100%,560px);aspect-ratio:1;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border:1px solid rgba(255,255,255,.13);box-shadow:0 18px 45px rgba(0,0,0,.35);overflow:hidden;touch-action:none}
.st-square{position:relative;display:grid;place-items:center;padding:0;border:0;font:inherit;user-select:none;cursor:pointer}
.st-square.light{background:#edd9bd}.st-square.dark{background:#ae8b70}
.st-board.alt .st-square.light{background:#f0f0e8}.st-board.alt .st-square.dark{background:#82a66a}
.st-square.st-last::before{content:"";position:absolute;inset:0;background:rgba(16,185,129,.32);pointer-events:none}
.st-square.st-selected{box-shadow:inset 0 0 0 4px rgba(16,185,129,.9)}
.st-square.st-dest::after{content:"";width:28%;height:28%;border-radius:50%;background:rgba(20,70,48,.45);pointer-events:none}
.st-square.st-cap::after{content:"";position:absolute;inset:5%;border:4px solid rgba(20,70,48,.55);border-radius:50%;pointer-events:none}
.st-square.st-dragging{z-index:10;pointer-events:none}
.st-square.st-dragging .st-piece{filter:drop-shadow(0 5px 5px rgba(0,0,0,.42))}
.st-piece{position:relative;z-index:1;display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
.st-glyph{display:grid;place-items:center;font-size:clamp(20px,4.4vw,48px);line-height:1;color:#111}
.st-coord{position:absolute;z-index:2;left:3px;bottom:1px;font-size:clamp(8px,1vw,11px);font-weight:600;line-height:1;opacity:.85;pointer-events:none}
.st-coord.file{left:auto;right:3px}
.st-square.light .st-coord{color:#ae8b70}.st-square.dark .st-coord{color:#edd9bd}
.st-board.alt .st-square.light .st-coord{color:#82a66a}.st-board.alt .st-square.dark .st-coord{color:#f0f0e8}
.st-nav{display:flex;gap:6px;flex-shrink:0}
.st-nav .st-btn{min-height:34px;padding:6px 11px}
.st-btn{min-height:36px;padding:7px 14px;border:1px solid var(--card-border);border-radius:var(--radius-sm);background:rgba(255,255,255,.05);color:var(--text);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:var(--transition)}
.st-btn:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff}
.st-btn:disabled{opacity:.4;cursor:default}
.st-btn.primary{background:var(--emerald);border-color:transparent;color:#041209;font-weight:600}
.st-btn.primary:hover:not(:disabled){background:var(--emerald-pale);color:#041209}
.st-btn:focus-visible,.st-tab:focus-visible,.st-seg button:focus-visible,.st-chip:focus-visible,.st-move:focus-visible,.st-chipmove:focus-visible,.st-square:focus-visible{outline:2px solid var(--emerald-pale);outline-offset:2px}
.st-line{position:relative;min-height:0;overflow:auto;display:grid;grid-template-columns:30px 1fr 1fr;grid-auto-rows:min-content;align-content:start;gap:2px;padding:8px;border-radius:var(--radius-sm);background:var(--surface);border:1px solid var(--card-border);font-size:14px;color:var(--text-muted);scrollbar-width:thin}
.st-num{padding:4px 0 0 4px;color:var(--text-faint);font-size:12.5px}
.st-line-empty{grid-column:1/-1;padding:4px;font-size:13px;line-height:1.5}
.st-chipmove{padding:3px 6px;border:0;border-radius:4px;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.st-chipmove:hover{background:rgba(255,255,255,.08)}
.st-chipmove.active{background:rgba(16,185,129,.22);color:var(--emerald-pale)}
.st-summary{padding:14px 18px;border-bottom:1px solid var(--card-border);display:flex;flex-direction:column;gap:8px}
.st-summary-text{font-size:14px;color:var(--text)}
.st-summary-text b{color:#fff}
.st-bar{display:flex;height:10px;border-radius:4px;overflow:hidden;background:#2a2a3c}
.st-bar .w{background:#10b981}.st-bar .d{background:#8b93a7}.st-bar .l{background:#ef4444}
.st-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--card-border)}
.st-tab{padding:11px 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text-muted);font:inherit;font-size:14px;font-weight:500;cursor:pointer}
.st-tab:hover{color:#fff}
.st-tab[aria-selected="true"]{color:var(--emerald-pale);border-bottom-color:var(--emerald)}
.st-panel{flex:1;min-height:0;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:16px;scrollbar-width:thin}
.st-panel[hidden]{display:none}
.st-seg{display:flex;gap:4px;padding:4px;border-radius:var(--radius-sm);background:var(--surface);border:1px solid var(--card-border)}
.st-seg button{flex:1;min-height:36px;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:var(--text-muted);font:inherit;font-size:13.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;line-height:1}
.st-seg button[aria-pressed="true"]{background:rgba(16,185,129,.16);color:var(--emerald-pale)}
.st-source-logo{display:inline-block;vertical-align:middle;object-fit:contain;pointer-events:none}
.st-source-logo.lichess{width:18px;height:18px;border-radius:50%;flex-shrink:0}
.st-source-logo.chesscom{height:18px;max-width:85px;width:auto;flex-shrink:0}
.st-chips{display:flex;flex-wrap:wrap;gap:6px}
.st-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--card-border);background:transparent;color:var(--text-muted);font:inherit;font-size:13px;cursor:pointer}
.st-chip[aria-pressed="true"]{border-color:rgba(16,185,129,.5);background:rgba(16,185,129,.14);color:var(--emerald-pale)}
.st-details{border:1px solid var(--card-border);border-radius:var(--radius-sm);padding:0 12px}
.st-details summary{min-height:40px;display:flex;align-items:center;cursor:pointer;font-size:14px;font-weight:500;color:var(--text)}
.st-details[open]{padding-bottom:12px}
.st-details[open] summary{margin-bottom:8px}
.st-details .form-row+.form-row,.st-details .st-grid2{margin-top:12px}
.st-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.st-actions{display:flex;gap:10px}
.st-actions .st-btn.primary{flex:1;min-height:42px}
.st-progress{height:6px;border-radius:3px;background:#2a2a3c;overflow:hidden}
.st-progress span{display:block;height:100%;width:0;background:var(--emerald);transition:width .2s ease}
.st-progress.indeterminate span{width:35%;animation:st-slide 1.1s ease-in-out infinite}
@keyframes st-slide{0%{margin-left:-35%}100%{margin-left:100%}}
.st-status{min-height:20px;font-size:13px;color:var(--text-muted);line-height:1.5}
.st-status.error{color:#fca5a5}
.st-hint,.st-empty{font-size:13px;line-height:1.55;color:var(--text-muted)}
.st-empty{padding:20px 4px}
.st-tree-head{font-size:13px;font-weight:600;color:var(--emerald-pale)}
.st-table{width:100%;border-collapse:collapse;font-size:13.5px}
.st-table th{padding:6px 6px;text-align:left;font-size:12px;font-weight:500;color:var(--text-faint);border-bottom:1px solid var(--card-border)}
.st-table td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.st-table tbody tr:hover{background:rgba(255,255,255,.03)}
.st-move{padding:4px 10px;border:0;border-radius:5px;background:rgba(16,185,129,.12);color:var(--emerald-pale);font:inherit;font-weight:600;cursor:pointer}
.st-move:hover{background:rgba(16,185,129,.26)}
.st-n small{display:block;color:var(--text-faint);font-size:11.5px}
.st-pcts{margin-top:3px;font-size:11.5px;color:var(--text-faint)}
.st-game{display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.05)}
.st-res{flex:0 0 26px;height:26px;display:grid;place-items:center;border-radius:6px;font-size:12px;font-weight:700}
.st-res.w{background:rgba(16,185,129,.2);color:#6ee7b7}.st-res.d{background:rgba(139,147,167,.2);color:#cbd5e1}.st-res.l{background:rgba(239,68,68,.2);color:#fca5a5}
.st-game-info{flex:1;min-width:0}
.st-game-opp{font-size:14px;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-game-meta{font-size:12px;color:var(--text-faint)}
.st-game a{color:var(--emerald-pale);font-size:13px;text-decoration:none}
.st-game a:hover{text-decoration:underline}
.st-more-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.st-board-wrap{container-type:size}
@supports (width:1cqw){.st-board{width:min(100cqw,100cqh)}}
@media (max-width:1100px){.st-body{grid-template-columns:minmax(0,1fr) 340px}.st-stage{grid-template-columns:minmax(0,1fr) 170px}}
@media (prefers-reduced-motion:reduce){.st-progress.indeterminate span{animation:none;width:100%}.st-progress span{transition:none}}
@media (max-width:900px){
 .st-overlay{padding:0;align-items:stretch}
 .modal-box.st-shell{height:100dvh;width:100%;border-radius:0}
 .st-body{grid-template-columns:minmax(0,1fr);overflow:auto;display:block}
 .st-left{overflow:visible;border-right:0;border-bottom:1px solid var(--card-border)}
 .st-stage{grid-template-columns:minmax(0,1fr);grid-template-rows:auto}
 .st-board-wrap{container-type:normal}
 .st-board{width:min(100%,520px)}
 .st-line{max-height:150px}
 .st-right{min-height:480px}
 .st-panel{overflow:visible}
}`;

  const HTML = `
<section class="modal-box st-shell" role="dialog" aria-modal="true" aria-labelledby="stTitle">
  <div class="modal-header">
    <div class="modal-title" id="stTitle">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <span>Opening Scout</span>
    </div>
    <button class="modal-close-btn" id="stClose" type="button" aria-label="Close scout">✕</button>
  </div>
  <div class="st-body">
    <div class="st-left">
      <div class="st-topbar">
        <div class="st-opening" id="stOpening">Starting position</div>
        <div class="st-nav" role="toolbar" aria-label="Board navigation">
          <button class="st-btn" type="button" id="stFirst" aria-label="Back to the start">⏮</button>
          <button class="st-btn" type="button" id="stPrev" aria-label="Previous move">‹ Back</button>
          <button class="st-btn" type="button" id="stNext" aria-label="Next move">Next ›</button>
          <button class="st-btn" type="button" id="stLast" aria-label="Forward to the end of the line">⏭</button>
          <button class="st-btn" type="button" id="stFlip" aria-label="Flip board">Flip</button>
        </div>
      </div>
      <div class="st-stage">
        <div class="st-board-wrap"><div class="st-board" id="stBoard" role="grid" aria-label="Chessboard"></div></div>
        <div class="st-line" id="stLine" aria-label="Current line"></div>
      </div>
    </div>
    <div class="st-right">
      <div class="st-summary">
        <div class="st-summary-text" id="stSummaryText">No games loaded yet.</div>
        <div class="st-bar" id="stSummaryBar" hidden></div>
      </div>
      <div class="st-tabs" role="tablist" aria-label="Scout views">
        <button class="st-tab" type="button" role="tab" data-tab="player" aria-selected="true">Player</button>
        <button class="st-tab" type="button" role="tab" data-tab="tree" aria-selected="false">Tree</button>
        <button class="st-tab" type="button" role="tab" data-tab="games" aria-selected="false">Games</button>
        <button class="st-tab" type="button" role="tab" data-tab="more" aria-selected="false">More</button>
      </div>

      <div class="st-panel" data-panel="player" role="tabpanel">
        <div class="form-row">
          <span class="form-label">Games from</span>
          <div class="st-seg" id="stSource" role="group" aria-label="Game source">
            <button type="button" data-source="lichess" aria-pressed="true"><img class="st-source-logo lichess" src="./assets/lichesslogo.png" alt="" /><span>Lichess</span></button>
            <button type="button" data-source="chesscom" aria-pressed="false" aria-label="Chess.com"><img class="st-source-logo chesscom" src="./assets/chesscomlogo.png" alt="Chess.com" /></button>
            <button type="button" data-source="pgn" aria-pressed="false"><span>PGN file</span></button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" id="stUserLabel" for="stUser">Lichess username</label>
          <input class="form-input" id="stUser" type="text" autocomplete="off" spellcheck="false" placeholder="Enter your Lichess username" />
        </div>
        <div class="form-row" id="stFileRow" hidden>
          <label class="form-label" for="stFile">PGN file</label>
          <input class="form-input" id="stFile" type="file" accept=".pgn,text/plain" />
          <p class="st-hint">Type your name exactly as it appears in the White and Black tags.</p>
        </div>
        <div class="form-row">
          <span class="form-label">Play as</span>
          <div class="st-seg" id="stColor" role="group" aria-label="Player color">
            <button type="button" data-color="white" aria-pressed="true">White</button>
            <button type="button" data-color="black" aria-pressed="false">Black</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="stMax">Number of games</label>
          <select class="form-select" id="stMax">
            <option value="200">Latest 200</option>
            <option value="500">Latest 500</option>
            <option value="1000" selected>Latest 1,000</option>
            <option value="2000">Latest 2,000</option>
            <option value="5000">Latest 5,000</option>
          </select>
        </div>
        <details class="st-details" id="stFilters">
          <summary>Filters</summary>
          <div class="form-row">
            <span class="form-label">Time controls</span>
            <div class="st-chips" id="stSpeeds"></div>
          </div>
          <div class="st-grid2">
            <div class="form-row">
              <label class="form-label" for="stRated">Games</label>
              <select class="form-select" id="stRated">
                <option value="all">Rated and casual</option>
                <option value="rated">Rated only</option>
                <option value="casual">Casual only</option>
              </select>
            </div>
            <div class="form-row">
              <label class="form-label" for="stSince">Played since</label>
              <input class="form-input" id="stSince" type="date" />
            </div>
          </div>
          <div class="st-grid2">
            <div class="form-row">
              <label class="form-label" for="stOppMin">Opponent rating, min</label>
              <input class="form-input" id="stOppMin" type="number" min="0" max="4000" inputmode="numeric" placeholder="Any" />
            </div>
            <div class="form-row">
              <label class="form-label" for="stOppMax">Opponent rating, max</label>
              <input class="form-input" id="stOppMax" type="number" min="0" max="4000" inputmode="numeric" placeholder="Any" />
            </div>
          </div>
        </details>
        <div class="st-actions">
          <button class="st-btn primary" type="button" id="stLoad">Load games</button>
          <button class="st-btn" type="button" id="stCancel" hidden>Cancel</button>
        </div>
        <div class="st-progress" id="stProgress" hidden><span id="stProgressBar"></span></div>
        <p class="st-status" id="stStatus" role="status" aria-live="polite"></p>
      </div>

      <div class="st-panel" data-panel="tree" role="tabpanel" hidden>
        <div class="st-tree-head" id="stTreeHead"></div>
        <div id="stTreeBody"></div>
      </div>

      <div class="st-panel" data-panel="games" role="tabpanel" hidden>
        <div id="stGamesBody"></div>
      </div>

      <div class="st-panel" data-panel="more" role="tabpanel" hidden>
        <div class="st-more-grid">
          <button class="st-btn" type="button" id="stCopyPgn">Copy PGN</button>
          <button class="st-btn" type="button" id="stCopyFen">Copy FEN</button>
          <button class="st-btn" type="button" id="stReset">Clear line</button>
          <button class="st-btn" type="button" id="stTheme">Board colors</button>
        </div>
        <p class="st-status" id="stMoreStatus" role="status" aria-live="polite"></p>
        <p class="st-hint">Games are grouped by move order, so a position reached through a different move order counts separately. Each game is stored up to move 20, and Lichess and Chess.com each limit how fast games can be downloaded.</p>
      </div>
    </div>
  </div>
</section>`;

  const S = {
    source: 'lichess', formColor: 'white', speeds: new Set(SPEED_GROUPS),
    games: [], color: 'white', sourceName: '',
    game: null, line: [], ply: 0,
    flipped: false, selected: null, drag: null, suppressClick: false,
    tab: 'player', gamesShown: 40, abort: null, loading: false, searchId: 0,
    pos: { matches: [], stats: [], sum: { n: 0, W: 0, D: 0, L: 0 }, opening: '' }
  };

  const $ = id => document.getElementById(id);
  const q = sel => $('scoutStudio').querySelector(sel);
  const qa = sel => [...$('scoutStudio').querySelectorAll(sel)];
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0);
  const fmt = n => new Intl.NumberFormat().format(n);

  function toast(msg) {
    if (typeof root.showDashToast === 'function') root.showDashToast(msg);
    else setStatus(msg);
  }
  function setStatus(msg, isError) {
    const s = $('stStatus');
    s.textContent = msg || '';
    s.classList.toggle('error', !!isError);
  }

  /* ── preferences (username / source / color only) ── */
  function loadPrefs() {
    try { return JSON.parse(root.localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function savePrefs(cfg) {
    try {
      const p = loadPrefs();
      p.source = cfg.source; p.color = cfg.color;
      p.users = Object.assign({}, p.users, cfg.source === 'pgn' ? {} : { [cfg.source]: cfg.username });
      root.localStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch (e) { /* storage unavailable */ }
  }

  /* ── board ── */
  function renderBoard() {
    const board = $('stBoard');
    board.replaceChildren();
    const files = 'abcdefgh';
    const grid = S.game.board();
    const hist = S.game.history({ verbose: true });
    const last = hist.length ? hist[hist.length - 1] : null;
    const dests = S.selected ? S.game.moves({ square: S.selected, verbose: true }) : [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const row = S.flipped ? 7 - r : r, col = S.flipped ? 7 - c : c;
        const name = files[col] + (8 - row);
        const piece = grid[row][col];
        const sq = el('button', 'st-square ' + ((r + c) % 2 === 0 ? 'light' : 'dark'));
        sq.type = 'button';
        sq.dataset.square = name;
        sq.setAttribute('role', 'gridcell');
        sq.setAttribute('aria-label', name + (piece ? ', ' + (piece.color === 'w' ? 'white ' : 'black ') + piece.type : ''));
        if (name === S.selected) sq.classList.add('st-selected');
        if (last && (name === last.from || name === last.to)) sq.classList.add('st-last');
        const d = dests.find(m => m.to === name);
        if (d) sq.classList.add(d.flags.includes('c') || d.flags.includes('e') ? 'st-cap' : 'st-dest');
        if (piece) {
          const key = piece.color + piece.type.toUpperCase();
          const img = el('img', 'st-piece');
          img.src = PIECE_DIR + key + '.svg';
          img.alt = '';
          img.draggable = false;
          img.addEventListener('error', () => {
            const g = el('span', 'st-piece st-glyph', GLYPH[key] || '?');
            img.replaceWith(g);
          }, { once: true });
          sq.appendChild(img);
        }
        if (c === 0) sq.appendChild(el('span', 'st-coord', String(8 - row)));
        if (r === 7) sq.appendChild(el('span', 'st-coord file', files[col]));
        sq.addEventListener('click', () => onSquareClick(name));
        board.appendChild(sq);
      }
    }
    board.setAttribute('aria-label', 'Chessboard, ' + (S.game.turn() === 'w' ? 'White' : 'Black') + ' to move');
  }

  function onSquareClick(name) {
    if (S.suppressClick) { S.suppressClick = false; return; }
    const piece = S.game.get(name);
    if (S.selected) {
      if (S.selected !== name && playMove(S.selected, name)) return;
      S.selected = piece && piece.color === S.game.turn() && name !== S.selected ? name : null;
    } else if (piece && piece.color === S.game.turn()) {
      S.selected = name;
    }
    renderBoard();
  }

  function initBoardDrag() {
    const board = $('stBoard');
    board.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const sq = e.target.closest('.st-square');
      if (!sq) return;
      const p = S.game.get(sq.dataset.square);
      if (!p || p.color !== S.game.turn()) return;
      S.drag = { from: sq.dataset.square, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, sq, img: sq.querySelector('.st-piece') };
    });
    root.addEventListener('pointermove', e => {
      const d = S.drag;
      if (!d || d.id !== e.pointerId || !d.img) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      d.sq.classList.add('st-dragging');
      d.img.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      e.preventDefault();
    });
    root.addEventListener('pointerup', e => {
      const d = S.drag;
      if (!d || d.id !== e.pointerId) return;
      S.drag = null;
      if (!d.moved) return;
      d.sq.classList.remove('st-dragging');
      if (d.img) d.img.style.transform = '';
      S.suppressClick = true;
      setTimeout(() => { S.suppressClick = false; }, 0);
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const target = t && t.closest ? t.closest('.st-square') : null;
      if (target && target.dataset.square !== d.from) playMove(d.from, target.dataset.square);
      else renderBoard();
    });
    root.addEventListener('pointercancel', e => {
      const d = S.drag;
      if (!d || d.id !== e.pointerId) return;
      d.sq.classList.remove('st-dragging');
      if (d.img) d.img.style.transform = '';
      S.drag = null;
    });
  }

  /* ── line / position ── */
  function pushMove(mv) {
    S.line = S.line.slice(0, S.ply);
    S.line.push(normSan(mv.san));
    S.ply = S.line.length;
    S.selected = null;
    refresh();
  }
  function playMove(from, to) {
    const mv = S.game.move({ from, to, promotion: 'q' });
    if (!mv) return false;
    pushMove(mv);
    return true;
  }
  function playSan(san) {
    const mv = S.game.move(san, { sloppy: true });
    if (!mv) { toast('That move could not be played from this position.'); return; }
    pushMove(mv);
  }
  function setPly(n) {
    n = Math.max(0, Math.min(S.line.length, n));
    S.game = new root.Chess();
    for (let i = 0; i < n; i++) S.game.move(S.line[i], { sloppy: true });
    S.ply = n;
    S.selected = null;
    refresh();
  }
  function clearLine() { S.line = []; setPly(0); }

  function computePos() {
    const matches = matchGames(S.games, S.line.slice(0, S.ply));
    S.pos = {
      matches,
      stats: nextMoveStats(matches, S.ply),
      sum: summarize(matches),
      opening: openingLabel(matches, S.ply)
    };
  }

  function barOf(s, cls) {
    const bar = el('div', cls || 'st-bar');
    for (const [k, key] of [['w', 'W'], ['d', 'D'], ['l', 'L']]) {
      const seg = el('span', k);
      seg.style.width = (s.n ? s[key] * 100 / s.n : 0) + '%';
      bar.appendChild(seg);
    }
    return bar;
  }

  function renderLine() {
    const box = $('stLine');
    box.replaceChildren();
    if (!S.line.length) {
      box.appendChild(el('span', 'st-line-empty', 'Play a move on the board, or pick one from the Tree tab.'));
      return;
    }
    S.line.forEach((san, i) => {
      if (i % 2 === 0) box.appendChild(el('span', 'st-num', (i / 2 + 1) + '.'));
      const b = el('button', 'st-chipmove' + (S.ply === i + 1 ? ' active' : ''), san);
      b.type = 'button';
      b.addEventListener('click', () => setPly(i + 1));
      box.appendChild(b);
    });
    const act = box.querySelector('.active');
    if (act) {
      if (act.offsetTop + act.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = act.offsetTop + act.offsetHeight - box.clientHeight + 8;
      else if (act.offsetTop < box.scrollTop) box.scrollTop = Math.max(0, act.offsetTop - 8);
    }
  }

  function renderOpening() {
    let label = 'Starting position';
    if (S.ply > 0) {
      const san = S.line[S.ply - 1];
      label = S.pos.opening || ('After ' + Math.ceil(S.ply / 2) + (S.ply % 2 ? '. ' : '... ') + san);
    }
    $('stOpening').textContent = label;
  }

  function renderSummary() {
    const text = $('stSummaryText'), bar = $('stSummaryBar');
    bar.replaceChildren();
    if (!S.games.length) { text.textContent = 'No games loaded yet.'; bar.hidden = true; return; }
    const s = S.pos.sum;
    if (!s.n) {
      text.textContent = 'No loaded games reach this position.';
      bar.hidden = true;
      return;
    }
    text.replaceChildren();
    const b = el('b', '', fmt(s.n));
    text.append(b, ' of ' + fmt(S.games.length) + ' games reach this position. Win ' + pct(s.W, s.n) + '%, draw ' + pct(s.D, s.n) + '%, loss ' + pct(s.L, s.n) + '%.');
    for (const [k, key] of [['w', 'W'], ['d', 'D'], ['l', 'L']]) {
      const seg = el('span', k);
      seg.style.width = (s[key] * 100 / s.n) + '%';
      bar.appendChild(seg);
    }
    bar.hidden = false;
  }

  function renderTree() {
    const head = $('stTreeHead'), body = $('stTreeBody');
    body.replaceChildren();
    head.textContent = '';
    if (!S.games.length) {
      body.appendChild(el('p', 'st-empty', 'Load games in the Player tab to build the opening tree.'));
      return;
    }
    const { matches, stats } = S.pos;
    const myTurn = (S.game.turn() === 'w') === (S.color === 'white');
    head.textContent = myTurn ? 'Your moves from here' : 'Opponent replies from here';
    if (!stats.length) {
      body.appendChild(el('p', 'st-empty', matches.length
        ? 'None of the loaded games continue past this position.'
        : 'None of the loaded games reach this position.'));
      return;
    }
    const table = el('table', 'st-table');
    const thead = el('thead');
    const hr = el('tr');
    for (const t of ['Move', 'Games', 'Win · Draw · Loss', 'Score']) {
      const th = el('th', '', t);
      th.scope = 'col';
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const s of stats.slice(0, 30)) {
      const tr = el('tr');
      const tdMove = el('td');
      const btn = el('button', 'st-move', s.san);
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Play ' + s.san + ', ' + s.n + ' games');
      btn.addEventListener('click', () => playSan(s.san));
      tdMove.appendChild(btn);
      const tdN = el('td', 'st-n', fmt(s.n));
      tdN.appendChild(el('small', '', pct(s.n, matches.length) + '%'));
      const tdBar = el('td');
      tdBar.appendChild(barOf(s));
      tdBar.appendChild(el('div', 'st-pcts', pct(s.W, s.n) + ' · ' + pct(s.D, s.n) + ' · ' + pct(s.L, s.n)));
      const tdScore = el('td', '', pct(s.W + s.D / 2, s.n) + '%');
      tr.append(tdMove, tdN, tdBar, tdScore);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
    if (stats.length > 30) body.appendChild(el('p', 'st-hint', 'Showing the 30 most played moves.'));
  }

  function renderGames() {
    const body = $('stGamesBody');
    body.replaceChildren();
    if (!S.games.length) {
      body.appendChild(el('p', 'st-empty', 'Load games in the Player tab to see them here.'));
      return;
    }
    const list = S.pos.matches.slice().sort((a, b) => (b.date || 0) - (a.date || 0));
    if (!list.length) {
      body.appendChild(el('p', 'st-empty', 'No loaded games reach this position.'));
      return;
    }
    for (const g of list.slice(0, S.gamesShown)) {
      const row = el('div', 'st-game');
      row.appendChild(el('span', 'st-res ' + g.out.toLowerCase(), g.out));
      const info = el('div', 'st-game-info');
      info.appendChild(el('div', 'st-game-opp', 'vs ' + g.opp + (g.oppElo ? ' (' + g.oppElo + ')' : '')));
      const meta = [g.speed ? SPEED_LABEL[g.speed] : '', g.date ? new Date(g.date).toISOString().slice(0, 10) : '']
        .filter(Boolean).join(' · ');
      info.appendChild(el('div', 'st-game-meta', meta));
      row.appendChild(info);
      if (g.url) {
        const a = el('a', '', 'Open');
        a.href = g.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        row.appendChild(a);
      }
      body.appendChild(row);
    }
    if (list.length > S.gamesShown) {
      const more = el('button', 'st-btn', 'Show more (' + fmt(list.length - S.gamesShown) + ' left)');
      more.type = 'button';
      more.style.marginTop = '12px';
      more.addEventListener('click', () => { S.gamesShown += 40; renderGames(); });
      body.appendChild(more);
    }
  }

  function refresh() {
    computePos();
    renderBoard();
    renderLine();
    renderOpening();
    renderSummary();
    renderTree();
    if (S.tab === 'games') renderGames();
    $('stFirst').disabled = $('stPrev').disabled = S.ply === 0;
    $('stNext').disabled = $('stLast').disabled = S.ply === S.line.length;
  }

  function setTab(name) {
    S.tab = name;
    qa('.st-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    qa('.st-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (name === 'games') { S.gamesShown = 40; renderGames(); }
  }

  /* ── form ── */
  function setSource(src, restoreUser = false) {
    const sourceChanged = src !== S.source;
    S.source = src;
    qa('#stSource button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.source === src)));
    const isPgn = src === 'pgn';
    const name = src === 'lichess' ? 'Lichess' : src === 'chesscom' ? 'Chess.com' : 'PGN';
    $('stUserLabel').textContent = isPgn ? 'Your name in the PGN' : name + ' username';
    $('stUser').placeholder = isPgn ? 'Name as written in the PGN' : 'Enter your ' + name + ' username';
    $('stFileRow').hidden = !isPgn;
    $('stFilters').hidden = isPgn;
    if (restoreUser) $('stUser').value = (loadPrefs().users || {})[src] || '';
    else if (sourceChanged) $('stUser').value = '';
  }

  function readCfg() {
    const src = S.source;
    const username = $('stUser').value.trim();
    const isPgn = src === 'pgn';
    const num = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
    const sinceVal = $('stSince').value;
    const cfg = {
      source: src, username, color: S.formColor, max: Number($('stMax').value) || 1000,
      speeds: SPEED_GROUPS.filter(k => S.speeds.has(k)),
      rated: isPgn ? 'all' : $('stRated').value,
      since: !isPgn && sinceVal ? Date.parse(sinceVal + 'T00:00:00') : null,
      oppMin: isPgn ? null : num('stOppMin'), oppMax: isPgn ? null : num('stOppMax'),
      file: isPgn ? $('stFile').files[0] : null
    };
    if (isPgn) cfg.speeds = null;
    return cfg;
  }

  function validateCfg(cfg) {
    if (!cfg.username) return 'Enter a username to load games.';
    if (cfg.source === 'lichess' && !/^[A-Za-z0-9_-]{2,30}$/.test(cfg.username)) return 'Lichess usernames use letters, numbers, underscores and hyphens.';
    if (cfg.source === 'chesscom' && !/^[A-Za-z0-9_-]{3,25}$/.test(cfg.username)) return 'Chess.com usernames use letters, numbers, underscores and hyphens.';
    if (cfg.source === 'pgn' && !cfg.file) return 'Choose a PGN file first.';
    if (cfg.speeds && !cfg.speeds.length) return 'Pick at least one time control in Filters.';
    if (cfg.oppMin != null && cfg.oppMax != null && cfg.oppMin > cfg.oppMax) return 'Opponent rating minimum is higher than the maximum.';
    return '';
  }

  function setLoading(on, max) {
    S.loading = on;
    $('stLoad').disabled = on;
    $('stCancel').hidden = !on;
    const p = $('stProgress');
    p.hidden = !on;
    p.classList.toggle('indeterminate', on);
    $('stProgressBar').style.width = '';
    S.progressMax = max || 0;
  }

  function resetScout() {
    S.searchId++;
    if (S.abort) S.abort.abort();
    S.abort = null;
    setLoading(false);
    S.games = [];
    S.color = 'white';
    S.formColor = 'white';
    S.sourceName = '';
    S.game = new root.Chess();
    S.line = [];
    S.ply = 0;
    S.flipped = false;
    S.selected = null;
    S.drag = null;
    S.gamesShown = 40;
    S.speeds = new Set(SPEED_GROUPS);

    $('stUser').value = '';
    $('stFile').value = '';
    $('stMax').value = '1000';
    $('stRated').value = 'all';
    $('stSince').value = '';
    $('stOppMin').value = '';
    $('stOppMax').value = '';
    $('stFilters').open = false;
    $('stStatus').textContent = '';
    $('stStatus').classList.remove('error');
    $('stMoreStatus').textContent = '';
    $('stBoard').classList.remove('alt');
    setSource('lichess');
    qa('#stColor button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === 'white')));
    qa('#stSpeeds button').forEach(b => b.setAttribute('aria-pressed', 'true'));

    try {
      root.localStorage.removeItem(STORE_KEY);
    } catch (e) {
      // Storage may be unavailable; the current session is still reset.
    }

    setTab('player');
    refresh();
  }

  function onProgress(n) {
    const sourceLabel = S.source === 'lichess' ? 'Lichess' : S.source === 'chesscom' ? 'Chess.com' : 'file';
    setStatus('Loaded ' + fmt(n) + ' games from ' + sourceLabel + '…');
    if (S.progressMax) {
      const p = $('stProgress');
      p.classList.remove('indeterminate');
      $('stProgressBar').style.width = Math.min(100, n * 100 / S.progressMax) + '%';
    }
  }

  async function loadGames() {
    if (S.loading) return;
    const cfg = readCfg();
    const problem = validateCfg(cfg);
    if (problem) { setStatus(problem, true); return; }
    const searchId = ++S.searchId;
    const abort = new AbortController();
    S.abort = abort;
    setLoading(true, cfg.max);
    setStatus('Contacting ' + (cfg.source === 'lichess' ? 'Lichess' : cfg.source === 'chesscom' ? 'Chess.com' : 'file') + '…');
    try {
      const loader = cfg.source === 'lichess' ? fetchLichess : cfg.source === 'chesscom' ? fetchChesscom : readPgnFile;
      const games = await loader(cfg, n => {
        if (searchId === S.searchId) onProgress(n);
      }, abort.signal);
      if (searchId !== S.searchId) return;
      if (!games.length) {
        setStatus('No games matched. Try another color or loosen the filters.', true);
        return;
      }
      S.games = games;
      S.color = cfg.color;
      S.flipped = cfg.color === 'black';
      S.line = [];
      S.sourceName = cfg.source;
      savePrefs(cfg);
      const dates = games.map(g => g.date).filter(Boolean);
      const span = dates.length
        ? ' from ' + new Date(Math.min(...dates)).toISOString().slice(0, 10) + ' to ' + new Date(Math.max(...dates)).toISOString().slice(0, 10)
        : '';
      setStatus('Loaded ' + fmt(games.length) + ' games as ' + (cfg.color === 'white' ? 'White' : 'Black') + span + '.');
      setPly(0);
      setTab('tree');
    } catch (e) {
      if (searchId !== S.searchId) return;
      if (e && e.name === 'AbortError') setStatus('Loading cancelled.');
      else setStatus(e instanceof ScoutError ? e.message : 'Something went wrong while loading games. Try again.', true);
    } finally {
      if (searchId === S.searchId) {
        setLoading(false);
        S.abort = null;
      }
    }
  }

  async function copyText(text, label) {
    const status = $('stMoreStatus');
    try { await root.navigator.clipboard.writeText(text); status.textContent = label + ' copied to the clipboard.'; }
    catch (e) { status.textContent = 'Clipboard access was blocked. Select and copy it manually.'; }
  }

  /* ── mount ── */
  function mount() {
    if ($('scoutStudio')) return;
    const style = el('style');
    style.id = 'stStyles';
    style.textContent = CSS;
    document.head.appendChild(style);

    const overlay = el('div', 'modal-overlay st-overlay');
    overlay.id = 'scoutStudio';
    overlay.innerHTML = HTML;
    document.body.appendChild(overlay);

    S.game = new root.Chess();

    // speed chips
    const chips = $('stSpeeds');
    for (const k of SPEED_GROUPS) {
      const b = el('button', 'st-chip', SPEED_LABEL[k]);
      b.type = 'button';
      b.dataset.speed = k;
      b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => {
        if (S.speeds.has(k)) S.speeds.delete(k); else S.speeds.add(k);
        b.setAttribute('aria-pressed', String(S.speeds.has(k)));
      });
      chips.appendChild(b);
    }

    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        resetScout();
        overlay.classList.remove('open');
      }
    });
    $('stClose').addEventListener('click', () => {
      resetScout();
      overlay.classList.remove('open');
    });
    qa('.st-tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
    qa('#stSource button').forEach(b => b.addEventListener('click', () => setSource(b.dataset.source)));
    qa('#stColor button').forEach(b => b.addEventListener('click', () => {
      S.formColor = b.dataset.color;
      qa('#stColor button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('stLoad').addEventListener('click', loadGames);
    $('stCancel').addEventListener('click', () => { if (S.abort) S.abort.abort(); });
    $('stUser').addEventListener('keydown', e => { if (e.key === 'Enter') loadGames(); });

    $('stFirst').addEventListener('click', () => setPly(0));
    $('stPrev').addEventListener('click', () => setPly(S.ply - 1));
    $('stNext').addEventListener('click', () => setPly(S.ply + 1));
    $('stLast').addEventListener('click', () => setPly(S.line.length));
    $('stFlip').addEventListener('click', () => { S.flipped = !S.flipped; renderBoard(); });
    $('stReset').addEventListener('click', clearLine);
    $('stTheme').addEventListener('click', () => $('stBoard').classList.toggle('alt'));
    $('stCopyPgn').addEventListener('click', () => copyText(S.game.pgn(), 'PGN'));
    $('stCopyFen').addEventListener('click', () => copyText(S.game.fen(), 'FEN'));

    document.addEventListener('keydown', e => {
      if (!overlay.classList.contains('open')) return;
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPly(S.ply - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPly(S.ply + 1); }
    });

    initBoardDrag();
    const prefs = loadPrefs();
    if (prefs.color === 'black') {
      S.formColor = 'black';
      qa('#stColor button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.color === 'black')));
    }
    setSource(prefs.source === 'chesscom' || prefs.source === 'pgn' ? prefs.source : 'lichess', true);
    refresh();
  }

  /** Replaces the dashboard's old iframe-based Scout. */
  root.openScoutModal = function openScoutModal() {
    mount();
    $('scoutStudio').classList.add('open');
    if (S.tab === 'player' && !$('stUser').value && S.source !== 'pgn') $('stUser').focus({ preventScroll: true });
  };

  root.ChessAIScout = { core, state: S };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : globalThis);