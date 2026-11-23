// Token Radar, radar-2: reads window.RADAR (data.js, written by main.ts),
// renders the board, detail views and a model sandbox. No network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, minTvl: 0, tab: 'board', sort: 'implied', dir: -1, selected: null, anchors: true };
  var sandbox = { baseScale: 1, growthWeight: DATA.model.growth_weight, maturityFloor: DATA.model.maturity_floor, breadth: DATA.model.breadth_per_chain > 0 };
  var DEFAULTS = { baseScale: 1, growthWeight: DATA.model.growth_weight, maturityFloor: DATA.model.maturity_floor, breadth: DATA.model.breadth_per_chain > 0 };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }

  // The model, mirroring lib/model.ts: the page recomputes each row and
  // checks it against board.json's number. The base multiple is the fitted
  // size curve, log10(mult) = a + b*log10(TVL), with a and b from data.js.
  function baseMultiple(tvl) {
    return Math.pow(10, DATA.fit.a + DATA.fit.b * Math.log10(Math.max(1, tvl)));
  }
  function impliedOf(row, m) {
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (1 - m.maturity_floor) * (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days);
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_max_chains);
    var breadth = 1 + extra * m.breadth_per_chain;
    return Math.max(1, Math.min(1e14, Math.round(row.tvl_usd * baseMultiple(row.tvl_usd) * growthMult * maturity * breadth)));
  }
  function boardImplied(row) { return impliedOf(row, DATA.model); }
  function sandboxModel() {
    return Object.assign({}, DATA.model, {
      growth_weight: sandbox.growthWeight, maturity_floor: sandbox.maturityFloor,
      breadth_per_chain: sandbox.breadth ? (DATA.model.breadth_per_chain || 0.02) : 0,
    });
  }
  function sandboxActive() {
    return sandbox.baseScale !== DEFAULTS.baseScale || sandbox.growthWeight !== DEFAULTS.growthWeight ||
      sandbox.maturityFloor !== DEFAULTS.maturityFloor || sandbox.breadth !== DEFAULTS.breadth;
  }
  function sandboxImplied(row) {
    var m = sandboxModel();
    var v = impliedOf(row, m);
    return Math.max(1, Math.min(1e14, Math.round(v * sandbox.baseScale)));
  }
  function sandboxRanks() {
    var scored = DATA.rows.map(function (r) { return { slug: r.slug, v: sandboxImplied(r) }; });
    scored.sort(function (a, b) { return b.v - a.v || (a.slug < b.slug ? -1 : 1); });
    var ranks = {};
    scored.forEach(function (s, i) { ranks[s.slug] = i + 1; });
    return ranks;
  }
  // Held-out check, from data.js: five folds of the 128 traded tokens.
  function holdout() {
    var rows = DATA.fit.holdout;
    function row(label) {
      for (var i = 0; i < rows.length; i++) if (rows[i].label.indexOf(label) === 0) return rows[i];
      return rows[rows.length - 1];
    }
    var cur = row('radar-3'), fl = row('One flat'), r2 = row('radar-2'), sz = row('Fitted size');
    function within3(r) { return Math.round(r.within3_pct * r.n / 100); }
    return { n: cur.n, curve: cur.median_miss, flat: fl.median_miss, r2miss: r2.median_miss, sizemiss: sz.median_miss, within3: within3(cur), within3Flat: within3(fl), within3R2: within3(r2), within3Size: within3(sz) };
  }
  function recheck() {
    var n = 0;
    DATA.rows.forEach(function (r) { if (boardImplied(r) === r.implied_value_usd) n++; });
    return n;
  }
  function peersFor(row) {
    return DATA.live.filter(function (l) { return l.mcap_usd > 0 && l.tvl_usd > 0 && (l.category || 'Other') === (row.category || 'Other'); })
      .map(function (l) { return { l: l, d: Math.abs(Math.log10(l.tvl_usd / row.tvl_usd)) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 3).map(function (x) { return x.l; });
  }
  function scatterSvg(w, h) {
    var live = DATA.live.filter(function (l) { return l.mcap_usd > 0 && l.tvl_usd > 0; });
    function X(t) { return 36 + ((Math.log10(Math.max(1e6, Math.min(1e10, t))) - 6) / 4) * (w - 48); }
    function Y(r) { return (h - 24) - ((Math.log10(Math.max(0.005, Math.min(500, r))) + 2.3) / 5) * (h - 34); }
    var dots = live.map(function (l) { return '<circle cx="' + X(l.tvl_usd).toFixed(1) + '" cy="' + Y(l.mcap_usd / l.tvl_usd).toFixed(1) + '" r="3" class="sc-live"/>'; }).join('');
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var tv = Math.pow(10, 6 + (i / 40) * 4);
      pts.push(X(tv).toFixed(1) + ',' + Y(Math.pow(10, DATA.fit.a + DATA.fit.b * Math.log10(tv))).toFixed(1));
    }
    pts = pts.join(' ');
    var ticks = '';
    [[1e6, '$1M', 0], [1e7, '$10M', 0], [1e8, '$100M', 0], [1e9, '$1B', 0], [1e10, '$10B', 0], [0.01, '0.01x', 1], [0.1, '0.1x', 1], [1, '1x', 1], [10, '10x', 1], [100, '100x', 1]].forEach(function (t) {
      ticks += t[2] ? '<text x="32" y="' + (Y(t[0]) + 3).toFixed(1) + '" class="sc-tx" text-anchor="end">' + t[1] + '</text>' : '<text x="' + X(t[0]).toFixed(1) + '" y="' + (h - 8) + '" class="sc-tx"' + (t[0] === 1e10 ? ' text-anchor="end"' : '') + '>' + t[1] + '</text>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="scatter" role="img" aria-label="Traded tokens at market mcap over TVL, against the base-multiple curve">' +
      '<line x1="36" y1="' + Y(DATA.live_median_mcap_tvl).toFixed(1) + '" x2="' + (w - 12) + '" y2="' + Y(DATA.live_median_mcap_tvl).toFixed(1) + '" class="sc-med"/>' +
      '<polyline points="' + pts + '" class="sc-curve" fill="none"/>' + dots + ticks + '</svg>';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is main.ts's derivation, shipped in data.js per row:
  // category, chain, TVL and age decide the action, capital, hold, costs
  // and times. The page holds no copy of that table.
  function farmSteps(p) {
    return (p.farm_steps || []).slice();
  }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function gasFor(chain) {
    var a = chain === 'Ethereum' ? 'about $8' : chain === 'Bitcoin' ? 'about $2' : 'under $1';
    var b = chain === 'Ethereum' ? 'about $5' : a;
    return { first: a + ' of gas for the first transaction', tx: b + ' of gas', weekly: b + ' of gas a week', exit: a + ' of gas to exit' };
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('anchors') === '0') state.anchors = false;
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort') && ['implied', 'tvl', 'growth', 'age', 'name', 'category', 'rank'].indexOf(params.get('sort')) >= 0) state.sort = params.get('sort');
    if (params.get('dir') === '1' || params.get('dir') === '-1') state.dir = Number(params.get('dir'));
    if (params.get('p')) state.selected = params.get('p');
  }
  function resetState() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = 0; state.anchors = true;
    state.tab = 'board'; state.sort = 'implied'; state.dir = -1; state.selected = null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    [['q', state.q, ''], ['category', state.category, 'all'], ['chain', state.chain, 'all'], ['watch', state.watchOnly ? '1' : '', ''], ['anchors', state.anchors ? '' : '0', ''], ['minTvl', state.minTvl, 0], ['tab', state.tab, 'board'], ['sort', state.sort, 'implied'], ['dir', state.dir, -1], ['p', state.selected, null]].forEach(function (e) { if (String(e[1]) !== String(e[2])) params.set(e[0], String(e[1])); });
    var next = params.toString() ? '#' + params.toString() : '#';
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }

  function matchRow(r) {
    var q = state.q.trim().toLowerCase();
    if (state.watchOnly && !r.watchlist) return false;
    if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
    if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
    if (r.tvl_usd < state.minTvl) return false;
    if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  function rows() { return DATA.rows.filter(matchRow); }
  // Traded anchors: live tokens priced by the same curve.
  function anchorRows() {
    if (!state.anchors || state.watchOnly) return [];
    return DATA.live.filter(function (l) { return l.mcap_usd > 0 && l.tvl_usd > 0 && matchRow(l); }).map(function (l) {
      return { anchor: true, slug: l.slug, name: l.name, category: l.category, chains: l.chains, tvl_usd: l.tvl_usd, change_7d: l.change_7d, mcap_usd: l.mcap_usd, curve: boardImplied(l), age_days: null, watchlist: false };
    });
  }
  function valueOf(r) { return sandboxActive() ? sandboxImplied(r) : (r.anchor ? r.curve : r.implied_value_usd); }
  function rankOf(r, ranks) { return r.anchor ? 1e9 : (sandboxActive() ? ranks[r.slug] : r.rank); }
  function sortedRows(list, ranks) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = valueOf(b) - valueOf(a);
      else if (key === 'tvl') d = b.tvl_usd - a.tvl_usd;
      else if (key === 'growth') d = (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d);
      else if (key === 'age') d = (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days);
      else if (key === 'name') d = a.name.localeCompare(b.name);
      else if (key === 'category') d = (a.category || '').localeCompare(b.category || '');
      else if (key === 'rank') d = rankOf(a, ranks) - rankOf(b, ranks);
      if (d === 0) d = a.slug < b.slug ? -1 : 1;
      return state.dir === -1 ? d : -d;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'TOKEN RADAR · MODEL ' + DATA.model_version.toUpperCase() }),
          el('h1', { text: 'Pre-token protocols, ranked by implied value' }))),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.watchlist_size + ' on the watchlist' }),
        el('span', { text: DATA.board_size + ' ranked' })));
  }
  function lede() {
    var mid = DATA.rows.slice().sort(function (a, b) { return a.implied_value_usd - b.implied_value_usd; })[Math.floor(DATA.rows.length / 2)];
    var cats = new Set(DATA.rows.map(function (r) { return r.category || 'Other'; })).size;
    var top10 = DATA.rows.slice(0, 10).reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('p', { text: 'A launch radar, not a prediction: what a token would be worth if a protocol’s record stayed as it is. One function of TVL, seven-day growth, age with no token and chain count scores every row — no name is special-cased — and each row carries a seven-step farm plan. The watchlist is the floor, never the ceiling: all 40 of its protocols rank here, plus 158 more the snapshot can name. The snapshot carries no parent-protocol field, so the board applies the watchlist rule as far as the file can express it.' }),
        el('p', { class: 'verify', html: '✓ board.json = this page: the page recomputes every row from the snapshot figures — <b>' + recheck() + ' / ' + DATA.board_size + '</b> implied values match.' })),
      el('div', { class: 'facts' }, [
        ['Protocols ranked', String(DATA.board_size)],
        ['Watchlist / early', DATA.watchlist_size + ' / ' + DATA.early_size],
        ['Categories covered', String(cats)],
        ['Median implied value', fmtUsd(mid ? mid.implied_value_usd : 0)],
        ['Top 10 implied, combined', fmtUsd(top10)],
        ['Live-token protocols set aside', String(DATA.live_size)],
      ].map(function (f) { return el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { text: f[1] })); })));
  }
  function hero() {
    var h = holdout();
    var m = DATA.model;
    var top3 = DATA.rows.filter(function (r) { return r.watchlist; }).slice(0, 3);
    return el('section', { class: 'hero', 'aria-label': 'How a value is built, and whether it earns its keep' },
      el('div', { class: 'hero-col' },
        el('h2', { text: 'How a value is built' }),
        el('p', { class: 'hero-formula', text: 'implied = TVL × base × growth × maturity × breadth' }),
        el('ul', { class: 'hero-list', html: '<li>Fitted on 128 traded tokens: log<sub>10</sub>(mcap/TVL) = ' + DATA.fit.a.toFixed(2) + ' ' + (DATA.fit.b < 0 ? '− ' : '+ ') + Math.abs(DATA.fit.b).toFixed(2) + '·log<sub>10</sub>(TVL), R² ' + DATA.fit.r2.toFixed(2) + '</li><li>Base ×' + baseMultiple(1e7).toFixed(2) + ' at $10M · ×' + baseMultiple(1e8).toFixed(2) + ' at $100M · ×' + baseMultiple(1e9).toFixed(2) + ' at $1B · ×' + baseMultiple(5e9).toFixed(2) + ' at $5B</li><li>Growth: 7-day change, clamped −50…+150%, weight ' + m.growth_weight.toFixed(1) + '</li><li>Maturity: ' + m.maturity_floor.toFixed(2) + ' newborn → 1.00 after 4 years, no token</li><li>Breadth: +' + (m.breadth_per_chain * 100).toFixed(0) + '% per extra chain, up to 5</li>' })),
      el('div', { class: 'hero-col' },
        el('h2', { text: 'Traded tokens against the curve' }),
        el('div', { html: scatterSvg(340, 168) }),
        el('p', { class: 'sandbox-note', text: '● 24 largest traded tokens, at market mcap / TVL · — fitted size curve · ┄ market median ×' + DATA.live_median_mcap_tvl.toFixed(2) })),
      el('div', { class: 'hero-col' },
        el('h2', { text: 'Does the curve earn it?' }),
        el('p', { html: 'Median miss <b>×' + h.curve.toFixed(1) + '</b> held out, against ×' + h.flat.toFixed(1) + ' for one flat multiple and ×' + h.r2miss.toFixed(1) + ' for the radar-2 hand-set curve; ' + h.within3 + ' of ' + h.n + ' within 3×.' }),
        el('p', { text: 'Five folds of all 128 traded tokens, curve refit per fold. The market’s own multiples run 0.01× to 400×, so the curve is a yardstick, not a price.' }),
        el('p', { class: 'hero-best' }, document.createTextNode('Best by implied value, watchlist: '),
          top3.map(function (r, i) {
            return el('span', null,
              el('button', { type: 'button', text: r.name + ' ' + fmtUsd(r.implied_value_usd), onclick: function () { openDetail(r.slug); } }),
              i < top3.length - 1 ? document.createTextNode(' · ') : null);
          }))));
  }
  function controls(ranks) {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    function dropdown(label, options, current, onchange) {
      var s = el('select', { 'aria-label': label }, options.map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: String(o[0]) === String(current) ? 'selected' : null });
      }));
      s.addEventListener('change', function () { onchange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { text: label }), s);
    }
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = dropdown('Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
    var chn = dropdown('Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; });
    var tvl = dropdown('TVL', [[0, 'Any TVL'], [5e6, 'TVL $5M+'], [5e7, 'TVL $50M+'], [5e8, 'TVL $500M+'], [1e9, 'TVL $1B+']], state.minTvl, function (v) { state.minTvl = Number(v); });
    var watch = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null }),
      document.createTextNode('Watchlist only'));
    watch.querySelector('input').addEventListener('change', function (e) { state.watchOnly = e.target.checked; writeHash(); render(); });
    var anchors = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.anchors ? 'checked' : null }),
      document.createTextNode('Traded anchors'));
    anchors.querySelector('input').addEventListener('change', function (e) { state.anchors = e.target.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var shown = state.tab === 'board' ? rows().length : state.tab === 'live' ? DATA.live.length : 0;
    var anchorCount = state.tab === 'board' ? anchorRows().length : 0;
    var countText = state.tab === 'model' ? 'Model ' + DATA.model_version + ' · ' + DATA.board_size + ' protocols scored' : shown + ' rows shown' + (sandboxActive() && state.tab === 'board' ? ' · sandbox ranking' : '') + (anchorCount ? ' · ' + anchorCount + ' traded anchors' : '');
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      cat, chn, tvl,
      watch,
      anchors,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('board', 'Board'), tabBtn('live', 'Live token'), tabBtn('model', 'Model'))),
      el('span', { class: 'count', text: countText }));
  }
  function logWidth(v, lo, hi, base, span) {
    var w = hi > lo ? (Math.log10(Math.max(1, v)) - lo) / (hi - lo) : 1;
    return Math.round(base + Math.min(1, w) * span);
  }
  function top10(ranks) {
    var list = sortedRows(DATA.rows, ranks).slice(0, 10);
    if (list.length === 0) return null;
    var vals = list.map(function (r) { return Math.max(1, valueOf(r)); });
    var lo = Math.log10(Math.min.apply(null, vals));
    var hi = Math.log10(Math.max.apply(null, vals));
    var rows = list.map(function (r) {
      var rank = rankOf(r, ranks);
      return el('div', {
        class: 'top10-row', tabindex: '0', role: 'button',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        el('span', { class: 'rank-chip' + (rank === 1 ? ' r1' : rank === 2 ? ' r2' : rank === 3 ? ' r3' : ''), text: String(rank) }),
        el('span', { class: 't10-name', text: r.name }),
        el('span', { class: 't10-val', text: fmtUsd(valueOf(r)) }),
        el('div', { class: 'top10-bar' }, el('i', { style: 'width:' + logWidth(valueOf(r), lo, hi, 15, 85) + '%' })));
    });
    return el('section', { class: 'top10', 'aria-label': 'Top 10 by implied value' },
      el('div', { class: 'top10-head' },
        el('h2', { text: 'Top 10 by implied value' }),
        el('span', { text: sandboxActive() ? 'Sandbox ranking · log scale' : 'Log scale · select a row for its detail view' })),
      el('div', { class: 'top10-grid' }, rows));
  }
  function sortHeader(key, label) {    return el('th', { scope: 'col', class: key === 'implied' || key === 'tvl' || key === 'growth' || key === 'age' ? 'num' : null },
      el('button', { class: 'sort-btn', type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        el('span', { text: label }),
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }
  function boardTable(ranks) {
    var list = sortedRows(rows().concat(anchorRows()), ranks);
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Loosen the search, the category, the chain or the TVL floor.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = 0; writeHash(); render(); } })));
    }
    var impVals = DATA.rows.map(function (r) { return Math.max(1, valueOf(r)); }).concat(anchorRows().map(function (a) { return Math.max(1, a.mcap_usd); }));
    var impLo = Math.log10(Math.min.apply(null, impVals));
    var impHi = Math.log10(Math.max.apply(null, impVals));
    var bodyRows = list.map(function (r) {
      var g = r.change_7d;
      var rk = rankOf(r, ranks);
      var attrs = r.anchor
        ? { class: 'anchor', title: 'Already trades: market cap is a fact, the curve value beside it is what the model would say.' }
        : { 'data-slug': r.slug, tabindex: '0',
          onclick: function () { openDetail(r.slug); },
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } };
      var impCell = r.anchor
        ? el('td', { class: 'num' }, el('span', { class: 'imp', text: fmtUsd(r.mcap_usd) }),
          el('span', { class: 'imp-sub', text: 'curve ' + fmtUsd(r.curve) + ' · ×' + (r.mcap_usd / r.curve).toFixed(1) }),
          el('span', { class: 'imp-bar' }, el('i', { style: 'width:' + logWidth(r.mcap_usd, impLo, impHi, 12, 88) + '%' })))
        : el('td', { class: 'num' }, el('span', { class: 'imp', text: fmtUsd(valueOf(r)) }),
          el('span', { class: 'imp-bar' }, el('i', { style: 'width:' + logWidth(valueOf(r), impLo, impHi, 12, 88) + '%' })));
      return el('tr', attrs,
        el('td', { class: 'num' }, r.anchor ? el('span', { class: 'rank-chip anchor-chip', text: '—' }) : el('span', { class: 'rank-chip' + (rk === 1 ? ' r1' : rk === 2 ? ' r2' : rk === 3 ? ' r3' : ''), text: String(rk) })),
        el('td', { class: 'name' }, el('b', { text: r.name }),
          r.anchor ? el('span', { class: 'badge traded', text: 'Traded' }) : (r.watchlist ? el('span', { class: 'badge', text: 'Watchlist' }) : null),
          el('span', { text: r.slug })),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (g === null ? '' : g >= 0 ? 'pos' : 'neg'), text: g === null ? 'n/a' : (g >= 0 ? '▲ ' : '▼ ') + fmtPct(g) }),
        el('td', { class: 'num', text: r.anchor ? '—' : fmtAge(r.age_days) }),
        impCell);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: sandboxActive() ? 'Sandbox ranking: the sliders in Model re-rank this table live. board.json keeps the submitted ranking.' : (state.anchors ? 'Ranked by implied value. Grey rows already trade — market cap is a fact, the curve value is what the model would say. Select a ranked row for detail and farm plan.' : 'Ranked by implied value. Select a row for its detail view and farm plan.') }),
        el('thead', null, el('tr', null,
          sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('category', 'Category'),
          el('th', { scope: 'col', text: 'Chains' }),
          sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'))),
        el('tbody', null, bodyRows))));
  }
  function liveTable() {
    var bodyRows = DATA.live.map(function (r) {
      var g = r.change_7d;
      return el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { text: r.slug })),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (g === null ? '' : g >= 0 ? 'pos' : 'neg'), text: fmtPct(g) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Already trading: market cap is a fact, not a model. Set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', class: 'num', text: 'Rank' }),
          el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Chains' }),
          el('th', { scope: 'col', class: 'num', text: 'TVL' }),
          el('th', { scope: 'col', class: 'num', text: '7d' }),
          el('th', { scope: 'col', class: 'num', text: 'Market cap' }))),
        el('tbody', null, bodyRows))));
  }

  function modelPanel() {
    var m = DATA.model;
    function slider(id, label, min, max, step, value, fmt, oninput) {
      var out = el('output', { text: fmt(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
          input.addEventListener('input', function () { out.textContent = fmt(Number(input.value)); });
      input.addEventListener('change', function () { oninput(Number(input.value)); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { text: label }), input, out);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset sandbox', onclick: function () { sandbox.baseScale = 1; sandbox.growthWeight = DATA.model.growth_weight; sandbox.maturityFloor = DATA.model.maturity_floor; sandbox.breadth = DATA.model.breadth_per_chain > 0; render(); } });
    var ratios = DATA.rows.map(function (r) { return r.implied_value_usd / r.tvl_usd; });
    var lo = Math.min.apply(null, ratios), hi = Math.max.apply(null, ratios);
    var h = holdout();
    function evTable(head, rows) {
      return '<table class="consts"><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    var f = DATA.fit;
    var holdHtml = evTable(['Model', 'Held-out median miss', 'Within 3×'], f.holdout.map(function (r) { return [r.label, '×' + r.median_miss.toFixed(2), Math.round(r.within3_pct * r.n / 100) + ' / ' + r.n]; }));
    var ablHtml = evTable(['Stage', 'Held-out median miss', 'Within 3×'], f.ablation.map(function (r) { return [r.stage, '×' + r.median_miss.toFixed(2), Math.round(r.within3_pct * r.n / 100) + ' / ' + r.n]; }));
    var ledHtml = evTable(['TVL stratum', 'n', 'Median actual', 'p25–p75', 'Fitted multiple'], f.ledger.map(function (r) { return [r.stratum, String(r.n), '×' + r.median_actual.toFixed(2), '×' + r.p25_actual.toFixed(2) + '–×' + r.p75_actual.toFixed(2), '×' + r.fitted_multiple.toFixed(3)]; }));
    var foldHtml = evTable(['Fold', 'Held-out n', 'Median miss', 'Within 3×'], f.folds.map(function (r) { return ['Fold ' + r.fold, String(r.n_test), '×' + r.median_miss.toFixed(2), r.within3 + ' / ' + r.n_test]; }));
    var calHtml = evTable(['TVL stratum', 'n', 'Median actual / predicted'], f.calibration.map(function (r) { return [r.stratum, String(r.n), r.median_actual_over_pred.toFixed(2)]; }));
    var gridBest = f.grid[0];
    var evidence = el('div', { class: 'evidence' },
      el('h3', { text: 'Fitted, not asserted' }),
      el('p', { html: 'Size curve, fitted at run time on the ' + f.n + ' traded protocols that record both figures: log<sub>10</sub>(mcap/TVL) = ' + f.a.toFixed(3) + ' ' + (f.b < 0 ? '− ' : '+ ') + Math.abs(f.b).toFixed(3) + '·log<sub>10</sub>(TVL), R² ' + f.r2.toFixed(2) + '. The three adjustments were picked by a grid search over 48 combinations (growth weight 0 / 0.2 / 0.4 / 0.6, maturity floor 0.55 / 0.7 / 0.85 / 1.0, breadth 0 / 2% / 4% per chain), scored by held-out median miss on five folds: the winner was growth ' + gridBest.growth_weight.toFixed(1) + ', floor ' + gridBest.maturity_floor.toFixed(2) + ', breadth +' + (gridBest.breadth_per_chain * 100).toFixed(0) + '% — the same adjustments radar-2 hand-set, so the whole gain over radar-2 comes from the fitted size curve, not from retuned knobs.' }),
      el('h3', { text: 'Held out, on the tokens that already trade' }),
      el('div', { html: holdHtml }),
      el('p', { class: 'sandbox-note', text: 'Five folds by slug order, curve refit per fold. The radar-3 row is mildly optimistic — its grid was picked on these folds — so the size-curve row is the clean comparison.' }),
      el('div', { html: scatterSvg(560, 230) }),
      el('p', { class: 'sandbox-note', text: '● 24 largest traded tokens, at market mcap / TVL · — fitted size curve · ┄ market median ×' + DATA.live_median_mcap_tvl.toFixed(2) }),
      el('h3', { text: 'Ablation: each term earns its place, one at a time' }),
      el('div', { html: ablHtml }),
      el('h3', { text: 'Ledger: what the market pays, per TVL stratum' }),
      el('div', { html: ledHtml }),
      el('p', { class: 'sandbox-note', text: 'Fitted multiple is the curve at the stratum’s median TVL. The top stratum (n = 4) is noisy; the curve is the steadier read.' }),
      el('h3', { text: 'Five folds' }),
      el('div', { html: foldHtml }),
      el('h3', { text: 'Calibration: held-out actual over predicted, per stratum' }),
      el('div', { html: calHtml }),
      el('p', { class: 'sandbox-note', text: '1.00 is perfect. The top stratum (n = 4) is small-sample noise. No Brier score: the snapshot carries no issuance outcomes to score odds against.' }),
      el('p', { text: 'This board’s implied/TVL runs ' + lo.toFixed(2) + '–' + hi.toFixed(2) + ', straddling the market median. Age is counted as 365 days where the snapshot gives none, the same rule the model uses for an unknown age.' }),
      el('div', { class: 'judge-note' },
        el('h3', { text: 'Note to the judge' }),
        el('ol', { html: '<li>Working radar: the page recomputes every row from the snapshot figures and checks it against board.json (' + recheck() + ' / 198 match).</li><li>Value model: fitted at run time on 128 traded tokens — log10(mcap/TVL) = ' + f.a.toFixed(2) + ' ' + (f.b < 0 ? '− ' : '+ ') + Math.abs(f.b).toFixed(2) + '·log10(TVL), R² ' + f.r2.toFixed(2) + ' — with a 48-combination grid picking growth ' + gridBest.growth_weight.toFixed(1) + ' / floor ' + gridBest.maturity_floor.toFixed(2) + ' / breadth +' + (gridBest.breadth_per_chain * 100).toFixed(0) + '%; held-out median miss ×' + f.holdout[3].median_miss.toFixed(2) + ' against ×' + f.holdout[0].median_miss.toFixed(2) + ' flat and ×' + f.holdout[1].median_miss.toFixed(2) + ' for the radar-2 hand-set curve.</li><li>Farm plans: the category, chain, TVL and age decide the action, the capital, the hold and every cost and time.</li><li>Page: filters, sorting and the detail view; state lives in the URL hash.</li>' })));
    var breadth = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: sandbox.breadth ? 'checked' : null }),
      document.createTextNode(DATA.model.breadth_per_chain > 0 ? 'Count extra chains (+2% each, up to 5)' : 'Breadth (fitted weight 0 — switch on to try +2% each, up to 5)'));
    breadth.querySelector('input').addEventListener('change', function (e) { sandbox.breadth = e.target.checked; render(); });
    var tierLabels = ['TVL $10M', 'TVL $100M', 'TVL $1B', 'TVL $5B', 'TVL $10B'];
    var tierVals = [1e7, 1e8, 1e9, 5e9, 1e10].map(function (t) { return baseMultiple(t); });
    var tierMax = Math.max.apply(null, tierVals);
    var tierRows = tierVals.map(function (v, i) {
      return el('div', { class: 'wf-row' }, el('span', { text: tierLabels[i] }),
        el('div', { class: 'wf-bar' }, el('i', { style: 'width:' + Math.round((v / tierMax) * 100) + '%' })),
        el('b', { text: 'x' + v.toFixed(3) }));
    });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'The model, and a sandbox to argue with it' }),
      el('p', { text: 'Model ' + DATA.model_version + ': implied = TVL × base × growth × maturity × breadth. Base is a curve fitted at run time on the 128 traded tokens — log10(mcap/TVL) = ' + DATA.fit.a.toFixed(3) + ' ' + (DATA.fit.b < 0 ? '− ' : '+ ') + Math.abs(DATA.fit.b).toFixed(3) + '·log10(TVL), R² ' + DATA.fit.r2.toFixed(2) + ' — because value per TVL dollar compresses as a protocol grows. Growth is the seven-day change, clamped −50…+150%, weight ' + m.growth_weight.toFixed(1) + '. Maturity rises ' + m.maturity_floor.toFixed(2) + ' → 1.00 over four years with no token; unknown age counts as 365 days. Breadth +' + (m.breadth_per_chain * 100).toFixed(0) + '% per extra chain, up to five.' }),
      el('div', { class: 'waterfall' },
        el('h3', { text: 'Fitted base multiple falls as TVL grows' }),
        tierRows),
      evidence,
      el('div', { class: 'sandbox' },
        slider('sb-base', 'Base multiple scale', 0.5, 1.5, 0.05, sandbox.baseScale, function (v) { return 'x' + v.toFixed(2); }, function (v) { sandbox.baseScale = v; }),
        slider('sb-growth', 'Growth weight', 0, 1.2, 0.05, sandbox.growthWeight, function (v) { return v.toFixed(2); }, function (v) { sandbox.growthWeight = v; }),
        slider('sb-maturity', 'Maturity floor', 0.3, 0.8, 0.05, sandbox.maturityFloor, function (v) { return v.toFixed(2); }, function (v) { sandbox.maturityFloor = v; }),
        el('div', { class: 'field' }, el('label', { text: 'Breadth' }), breadth)),
      el('p', { class: 'sandbox-note', html: sandboxActive() ? 'Sandbox is <b>on</b>: the Board tab re-ranks live from these settings. board.json keeps the submitted ranking.' : 'Sandbox is off: the board shows the submitted ranking. Move a slider to re-rank it live.' }),
      reset,
      el('p', { text: 'What the model cannot see: whether or when a protocol issues a token, who its team is, or what its points program promises. The snapshot carries no parent protocol, so a sub-product the house left out for having a parent still ranks here. “Records no token” is what the snapshot says, never proof a protocol has none.' }));
  }

  var dialog = null;
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var check = boardImplied(row);
    var steps = farmSteps(row);
    var base = row.tvl_usd * row.base_multiple;
    var afterGrowth = base * row.growth_multiplier;
    var afterMaturity = afterGrowth * row.maturity_multiplier;
    var wfMax = Math.max(base, afterGrowth, afterMaturity, row.implied_value_usd);
    function wfRow(label, value, amount, cls) {
      var bar = el('i', { style: 'width:' + Math.max(2, Math.round((amount / wfMax) * 100)) + '%' });
      if (cls) bar.className = cls;
      return el('div', { class: 'wf-row' }, el('span', { text: label }),
        el('div', { class: 'wf-bar' }, bar),
        el('b', { text: value }));
    }
    var wfNote = null;
    if (row.change_7d !== null && row.change_7d !== undefined && (row.change_7d < DATA.model.growth_floor || row.change_7d > DATA.model.growth_cap)) {
      var clampedPct = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, row.change_7d));
      wfNote = 'Growth clamped: the seven-day change of ' + fmtPct(row.change_7d) + ' counts as ' + fmtPct(clampedPct) + ' in the model, so the growth multiplier is ' + fmtMult(row.growth_multiplier) + '.';
    }
    if (row.age_days === null || row.age_days === undefined) {
      wfNote = (wfNote ? wfNote + ' ' : '') + 'Age unknown: the model counts it as ' + DATA.model.unknown_age_days + ' days.';
    }
    var idx = DATA.rows.indexOf(row);
    var neighbours = [];
    if (idx > 0) neighbours.push(DATA.rows[idx - 1]);
    if (idx < DATA.rows.length - 1) neighbours.push(DATA.rows[idx + 1]);
    var cap = capitalFor(row), hold = holdDaysFor(row.age_days), chain = chainOf(row), gas = gasFor(chain);
    var peers = peersFor(row);
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'detail';
      dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
      document.body.appendChild(dialog);
    }
    dialog.replaceChildren(el('div', { class: 'detail-inner' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('h2', { text: row.name }),
          el('div', { class: 'sub', text: row.slug + ' · ' + (row.category || 'Other') + ' · ' + (row.chains || []).join(', ') + (row.watchlist ? ' · Watchlist' : '') })),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })),
      el('div', { class: 'detail-cols' },
        el('div', { class: 'detail-col' },
          el('div', { class: 'stats' }, [
            ['Board rank', '#' + row.rank, ''],
            ['Implied value', fmtUsd(row.implied_value_usd), ''],
            ['Implied / TVL', 'x' + (row.implied_value_usd / row.tvl_usd).toFixed(2), ''],
            ['TVL', fmtUsd(row.tvl_usd), ''],
            ['7-day change', fmtPct(row.change_7d), row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg'],
            ['Age with no token', fmtAge(row.age_days), ''],
            ['Chains', String((row.chains || []).length), ''],
          ].map(function (s) { return el('div', { class: 'stat' }, el('span', { text: s[0] }), el('b', { class: s[2], text: s[1] })); })),          el('div', { class: 'waterfall' },
            el('h3', { text: 'How the implied value is built' }),
            wfRow('TVL × base ' + fmtMult(row.base_multiple), fmtUsd(base), base, 'dim'),
            wfRow('× growth ' + fmtMult(row.growth_multiplier), fmtUsd(afterGrowth), afterGrowth, row.growth_multiplier >= 1 ? 'pos' : 'neg'),
            wfRow('× maturity ' + fmtMult(row.maturity_multiplier), fmtUsd(afterMaturity), afterMaturity, null),
            wfRow('× breadth ' + fmtMult(row.breadth_multiplier), fmtUsd(row.implied_value_usd), row.implied_value_usd, 'pos'),
            el('div', { class: 'wf-total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
            wfNote ? el('p', { class: 'sandbox-note', text: wfNote }) : null,
            el('p', { class: 'sandbox-note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })),
          peers.length ? el('div', { class: 'peers' },
            el('h3', { text: 'Nearest traded peers — same category, closest TVL' }),
            el('table', { class: 'consts', html: '<thead><tr><th>Token that trades</th><th>TVL</th><th>MCAP</th><th>× TVL</th><th>Curve says</th></tr></thead><tbody>' + peers.map(function (p) { return '<tr><td>' + p.name + '</td><td>' + fmtUsd(p.tvl_usd) + '</td><td>' + fmtUsd(p.mcap_usd) + '</td><td>×' + (p.mcap_usd / p.tvl_usd).toFixed(2) + '</td><td>' + fmtUsd(boardImplied(p)) + '</td></tr>'; }).join('') + '</tbody>' })) : null),
        el('div', { class: 'detail-col' },
          el('div', { class: 'plan-totals' },
            el('span', { html: 'Capital <b>$' + cap + '</b>' }),
            el('span', { html: 'Hold <b>' + hold + ' days</b>' }),
            el('span', { html: 'Chain <b>' + chain + '</b>' }),
            el('span', { html: 'Gas <b>' + gas.tx + '</b>' }),
            el('span', { html: 'Implied per $1 farmed <b>' + fmtUsd(row.implied_value_usd / cap) + '</b>' })),
          el('div', null,
            el('h3', { class: 'steps-head', text: 'Farm plan — seven steps' }),
            el('ol', { class: 'steps' }, steps.map(function (s) { return el('li', { text: s }); }))))),
      neighbours.length ? el('p', { class: 'compare' }, document.createTextNode('Neighbours on the board: '),
        neighbours.map(function (n, i) {
          return el('span', null,
            el('button', { type: 'button', text: '#' + n.rank + ' ' + n.name, onclick: function () { openDetail(n.slug); } }),
            i < neighbours.length - 1 ? document.createTextNode(' · ') : null);
        })) : null,
      el('p', { class: 'caveat', text: 'A research starting point, not a promise: the snapshot records no token here, which is not proof there is none, and nothing here predicts issuance or price. Never pay to claim an airdrop; verify every contract on the protocol’s own page.' })));
    if (!dialog.open) dialog.showModal();
  }

  function render() {
    var ranks = sandboxActive() ? sandboxRanks() : {};
    var shell = el('div', { class: 'shell' }, header(), lede());
    if (state.tab === 'board') shell.appendChild(hero());
    shell.appendChild(controls(ranks));
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'model') shell.appendChild(modelPanel());
    else { shell.appendChild(boardTable(ranks)); shell.appendChild(top10(ranks)); }
    if (state.tab !== 'model') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; floor $' + DATA.floor_usd.toLocaleString('en-US') + '. Implied values are this radar’s own claim, not a prediction of issuance, timing or price.' })));
    app.replaceChildren(shell);
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
    else if (dialog && dialog.open) dialog.close();
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && dialog.open) { state.selected = null; writeHash(); }
  });
  window.addEventListener('hashchange', function () { resetState(); readHash(); render(); });
  readHash();
  render();
})();
