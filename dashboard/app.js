// Token Radar, radar-2: a plain dashboard that reads window.RADAR (written
// beside dashboard/ by main.ts) and renders the ranked board, a filterable
// table, a per-protocol detail view with the model's own inputs and the
// protocol's farm plan, and a model sandbox that re-ranks the board live.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, minTvl: 0, tab: 'board', sort: 'implied', dir: -1, selected: null };
  var sandbox = { baseScale: 1, growthWeight: 0.6, maturityFloor: 0.55, breadth: true };
  var DEFAULTS = { baseScale: 1, growthWeight: 0.6, maturityFloor: 0.55, breadth: true };

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

  // The model in one function, mirroring lib/model.ts: the page recomputes a
  // row from the snapshot figures and checks the number board.json carries,
  // so the page's code and the board's data are visibly the same arithmetic.
  function baseMultiple(tvl) {
    if (tvl < 1e8) return DATA.model.base_tiers[0];
    if (tvl < 1e9) return DATA.model.base_tiers[1];
    if (tvl < 5e9) return DATA.model.base_tiers[2];
    return DATA.model.base_tiers[3];
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
    return {
      base_tiers: DATA.model.base_tiers, growth_weight: sandbox.growthWeight,
      growth_floor: DATA.model.growth_floor, growth_cap: DATA.model.growth_cap,
      maturity_floor: sandbox.maturityFloor, maturity_days: DATA.model.maturity_days,
      unknown_age_days: DATA.model.unknown_age_days,
      breadth_per_chain: sandbox.breadth ? DATA.model.breadth_per_chain : 0,
      breadth_max_chains: DATA.model.breadth_max_chains,
    };
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
  // Sandbox ranks over the whole board, so a filtered view still shows a
  // row's place in the full ranking.
  function sandboxRanks() {
    var m = sandboxModel();
    var scored = DATA.rows.map(function (r) { return { slug: r.slug, v: Math.max(1, Math.min(1e14, Math.round(impliedOf(r, m) * sandbox.baseScale))) }; });
    scored.sort(function (a, b) { return b.v - a.v || (a.slug < b.slug ? -1 : 1); });
    var ranks = {};
    scored.forEach(function (s, i) { ranks[s.slug] = i + 1; });
    return ranks;
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

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time, and the chain decides the gas. No name is special-cased.
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
  function hasWord(c, word) { return new RegExp('\\b' + word).test(c); }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (hasWord(c, 'dex') || c.indexOf('swap') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' basis vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed liquidity vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s main yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL yield pool on " + chain + ' and keep the position open.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s main farm on " + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield asset on " + chain + ' and hold it.';
    if (c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Mint $' + capital + " of " + name + "'s BTC-backed asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the channel open.';
    if (c.indexOf('otc') >= 0) return 'Place a $' + capital + ' order on ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('card') >= 0) return 'Load $' + capital + ' onto a ' + name + ' card on ' + chain + ' and make one small purchase.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + " into " + name + "'s incentives vault on " + chain + ' and keep the shares.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC through ' + name + ' to ' + chain + ' and use the bridged funds in its app.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + ' through its official bridge, then use one flagship app on it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $10 against the supply on ' + name + ', then repay it the same week.';
    if (hasWord(c, 'dex') || c.indexOf('swap') >= 0) return 'Swap $10 through ' + name + "'s main pool on " + chain + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('cedefi') >= 0 || c.indexOf('basis trading') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('governance') >= 0) return 'Deposit $10 more into a second ' + name + ' vault on ' + chain + '.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Claim or compound the yield the ' + name + ' position earned, even if it is small.';
    if (c.indexOf('farm') >= 0) return 'Harvest the rewards the ' + name + ' farm paid, or compound them back into the position.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge on ' + name + ', then open a fresh one half its size.';
    if (c.indexOf('prediction') >= 0) return 'Settle or close the first position on ' + name + ', then place a second one.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the staking rewards ' + name + ' paid, or claim them to the same wallet.';
    if (c.indexOf('stable') >= 0) return 'Swap $10 of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield ' + name + ' accrued and leave it compounding in the position.';
    if (c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Check the yield ' + name + "'s BTC-backed asset accrued and leave it compounding.";
    if (c.indexOf('insurance') >= 0) return 'Open the ' + name + ' policy page and confirm the cover is still active.';
    if (c.indexOf('payment') >= 0) return 'Make a second $10 payment through ' + name + '.';
    if (c.indexOf('otc') >= 0) return 'Fill a second $10 order on ' + name + '.';
    if (c.indexOf('card') >= 0) return 'Make a second small purchase with the ' + name + ' card.';
    if (c.indexOf('index') >= 0) return 'Check what the ' + name + ' index holds and hold the position through the next rebalance.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 back through ' + name + ', or use the bridged funds in a second app on ' + chain + '.';
    if (c.indexOf('chain') >= 0) return 'Use a second app on the chain, such as its main swap or lending market.';
    return 'Make a second $10 deposit into ' + name + ' on ' + chain + ', or use a second feature of it.';
  }
  function gasFor(chain) {
    if (chain === 'Ethereum') return { first: 'about $8 of gas for the first transaction', tx: 'about $5 of gas', weekly: 'about $5 of gas a week', exit: 'about $8 of gas to exit' };
    if (chain === 'Bitcoin') return { first: 'about $2 of gas for the first transaction', tx: 'about $2 of gas', weekly: 'about $2 of gas a week', exit: 'about $2 of gas to exit' };
    return { first: 'under $1 of gas for the first transaction', tx: 'under $1 of gas', weekly: 'under $1 of gas a week', exit: 'under $1 of gas to exit' };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas.first, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas.tx, time: '15 minutes to set up' },
      { text: secondActionFor(p, chain), cost: gas.tx, time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own rewards page, if it has one, and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in steps and keep $5 of gas in the wallet.', cost: gas.exit, time: '15 minutes to unwind' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort') && ['implied', 'tvl', 'growth', 'age', 'name', 'category', 'rank'].indexOf(params.get('sort')) >= 0) state.sort = params.get('sort');
    if (params.get('dir') === '1' || params.get('dir') === '-1') state.dir = Number(params.get('dir'));
    if (params.get('p')) state.selected = params.get('p');
  }
  /** Back to the defaults, so a fresh hash read from a changed address never keeps stale filters. */
  function resetState() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = 0;
    state.tab = 'board'; state.sort = 'implied'; state.dir = -1; state.selected = null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString() ? '#' + params.toString() : '#';
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }

  // --- filtering and sorting -------------------------------------------------
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function valueOf(r) { return sandboxActive() ? sandboxImplied(r) : r.implied_value_usd; }
  function rankOf(r, ranks) { return sandboxActive() ? ranks[r.slug] : r.rank; }
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
      // dir -1 is the sensible default for the key (biggest value, or rank 1, first); +1 flips it.
      return state.dir === -1 ? d : -d;
    });
  }

  // --- page pieces -----------------------------------------------------------
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
    var top10 = DATA.rows.slice(0, 10).reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var mid = DATA.rows.slice().sort(function (a, b) { return a.implied_value_usd - b.implied_value_usd; })[Math.floor(DATA.rows.length / 2)];
    var cats = new Set(DATA.rows.map(function (r) { return r.category || 'Other'; })).size;
    return el('section', { class: 'lede' },
      el('div', null,
        el('p', { text: 'A launch radar, not a prediction: what a token would be worth if a protocol’s record stayed as it is, and how to farm it before or after it issues one. Every row is scored by one function of the snapshot’s own figures — TVL, seven-day growth, age with no token, and how many chains it runs on — and no protocol name is special-cased.' }),
        el('p', { text: 'The watchlist is the floor, never the ceiling: the board covers all 40 of its protocols, then every other launch candidate the snapshot’s ten fields can name — 138 below the $50M floor and 20 more above it that the watchlist leaves out. The snapshot carries no parent-protocol field, so the board’s rule is the watchlist rule as far as the file can express it.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Protocols ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist / early' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.early_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Categories covered' }), el('b', { text: String(cats) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(mid ? mid.implied_value_usd : 0) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top 10 implied, combined' }), el('b', { text: fmtUsd(top10) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))));
  }
  function controls(ranks) {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { 'aria-label': 'Filter by category' },
      [el('option', { value: 'all', text: 'All categories' })].concat(categories.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chn = el('select', { 'aria-label': 'Filter by chain' },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })));
    chn.addEventListener('change', function () { state.chain = chn.value; writeHash(); render(); });
    var tvl = el('select', { 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [5e6, 'TVL $5M+'], [5e7, 'TVL $50M+'], [5e8, 'TVL $500M+'], [1e9, 'TVL $1B+']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: state.minTvl === o[0] ? 'selected' : null });
      }));
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); writeHash(); render(); });
    var watch = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null }),
      document.createTextNode('Watchlist only'));
    watch.querySelector('input').addEventListener('change', function (e) { state.watchOnly = e.target.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var shown = state.tab === 'board' ? rows().length : state.tab === 'live' ? DATA.live.length : 0;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), chn),
      el('div', { class: 'field' }, el('label', { text: 'TVL' }), tvl),
      watch,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('board', 'Board'), tabBtn('live', 'Live token'), tabBtn('model', 'Model'))),
      el('span', { class: 'count', text: state.tab === 'model' ? 'Model ' + DATA.model_version + ' · ' + DATA.board_size + ' protocols scored' : sandboxActive() && state.tab === 'board' ? shown + ' rows shown · sandbox ranking' : shown + ' rows shown' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: key === 'implied' || key === 'tvl' || key === 'growth' || key === 'age' ? 'num' : null },
      el('button', { class: 'sort-btn', type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        el('span', { text: label }),
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }
  function boardTable(ranks) {
    var list = sortedRows(rows(), ranks);
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Loosen the search, the category, the chain or the TVL floor.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = 0; writeHash(); render(); } })));
    }
    var bodyRows = list.map(function (r) {
      var g = r.change_7d;
      return el('tr', {
        'data-slug': r.slug, tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        el('td', { class: 'num', text: String(rankOf(r, ranks)) }),
        el('td', { class: 'name' }, el('b', { text: r.name }),
          r.watchlist ? el('span', { class: 'badge', text: 'Watchlist' }) : null,
          el('span', { text: r.slug })),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (g === null ? '' : g >= 0 ? 'pos' : 'neg'), text: fmtPct(g) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(valueOf(r)) }));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: sandboxActive() ? 'Sandbox ranking: the sliders in Model re-rank this table live. board.json keeps the submitted ranking.' : 'Ranked by implied value. Select a row for its detail view and farm plan.' }),
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
        el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
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

  // --- model panel + sandbox ---------------------------------------------------
  function modelPanel() {
    var m = DATA.model;
    function slider(id, label, min, max, step, value, fmt, oninput) {
      var out = el('output', { text: fmt(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      // Live-read the value while dragging; re-rank only on release, so a
      // full render never steals the slider mid-drag.
      input.addEventListener('input', function () { out.textContent = fmt(Number(input.value)); });
      input.addEventListener('change', function () { oninput(Number(input.value)); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { text: label }), input, out);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset sandbox', onclick: function () { sandbox.baseScale = 1; sandbox.growthWeight = 0.6; sandbox.maturityFloor = 0.55; sandbox.breadth = true; render(); } });
    var ratios = DATA.rows.map(function (r) { return r.implied_value_usd / r.tvl_usd; });
    var lo = Math.min.apply(null, ratios), hi = Math.max.apply(null, ratios);
    var calibration = el('p', { text: 'Calibration: protocols whose token already trades carry a median market-cap/TVL of ' + DATA.live_median_mcap_tvl.toFixed(2) + '; this board’s implied/TVL runs ' + lo.toFixed(2) + '–' + hi.toFixed(2) + ', straddling that median — the youngest and slowest sit just under it, the fastest growers and oldest names above it. The multiples are checked against what tokens trade at, not asserted.' });
    var breadth = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: sandbox.breadth ? 'checked' : null }),
      document.createTextNode('Count extra chains (+2% each, up to 5)'));
    breadth.querySelector('input').addEventListener('change', function (e) { sandbox.breadth = e.target.checked; render(); });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'The model, and a sandbox to argue with it' }),
      el('p', { text: 'Model ' + DATA.model_version + ': implied = TVL × base multiple × growth multiplier × maturity multiplier × breadth multiplier. The base multiple steps down as TVL grows — 0.45 under $100M, 0.35 under $1B, 0.28 under $5B, 0.22 above — because a token’s value per dollar of TVL compresses as a protocol grows. Growth is the seven-day TVL change, clamped to −50%…+150% and weighted 0.6. Maturity rises from 0.55 for a newborn to 1.00 after four years with no token; an unknown age counts as 365 days. Breadth adds 2% per extra chain, up to five.' }),
      el('table', { class: 'consts' },
        el('thead', null, el('tr', null, el('th', { text: 'Constant' }), el('th', { text: 'Value' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: 'Base multiple, TVL under $100M / $1B / $5B / above' }), el('td', { text: '0.45 / 0.35 / 0.28 / 0.22' })),
          el('tr', null, el('td', { text: 'Growth weight, clamp' }), el('td', { text: '0.6, −50%…+150%' })),
          el('tr', null, el('td', { text: 'Maturity floor, full maturity' }), el('td', { text: '0.55, 1,460 days' })),
          el('tr', null, el('td', { text: 'Unknown age counts as' }), el('td', { text: '365 days' })),
          el('tr', null, el('td', { text: 'Breadth per extra chain, cap' }), el('td', { text: '+2%, 5 chains' })))),
      calibration,
      el('div', { class: 'sandbox' },
        slider('sb-base', 'Base multiple scale', 0.5, 1.5, 0.05, sandbox.baseScale, function (v) { return 'x' + v.toFixed(2); }, function (v) { sandbox.baseScale = v; }),
        slider('sb-growth', 'Growth weight', 0, 1.2, 0.05, sandbox.growthWeight, function (v) { return v.toFixed(2); }, function (v) { sandbox.growthWeight = v; }),
        slider('sb-maturity', 'Maturity floor', 0.3, 0.8, 0.05, sandbox.maturityFloor, function (v) { return v.toFixed(2); }, function (v) { sandbox.maturityFloor = v; }),
        el('div', { class: 'field' }, el('label', { text: 'Breadth' }), breadth)),
      el('p', { class: 'sandbox-note', html: sandboxActive() ? 'Sandbox is <b>on</b>: the Board tab re-ranks live from these settings. board.json keeps the submitted ranking.' : 'Sandbox is off: the board shows the submitted ranking. Move a slider to re-rank it live.' }),
      reset,
      el('p', { text: 'What the model cannot see: whether or when a protocol issues a token, who its team is, or what its points program promises. The snapshot’s ten fields carry no parent protocol, so the board cannot apply that part of the watchlist rule: a sub-product the house left out for having a parent still ranks here. “Records no token” is what the snapshot says, never proof a protocol has none — a protocol on this board may still have a token its record does not carry.' }));
  }

  // --- detail view ---------------------------------------------------------------
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
    // Bars are scaled to the largest of the four values, so a bar's length is the value it stands for.
    var wfMax = Math.max(base, afterGrowth, afterMaturity, row.implied_value_usd);
    function wfRow(label, value, amount) {
      return el('div', { class: 'wf-row' }, el('span', { text: label }),
        el('div', { class: 'wf-bar' }, el('i', { style: 'width:' + Math.max(2, Math.round((amount / wfMax) * 100)) + '%' })),
        el('b', { text: value }));
    }
    // Say so when the row's own figures are not the ones the model used: a
    // seven-day change past the clamp, or an age the snapshot never recorded.
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
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Board rank' }), el('b', { text: '#' + row.rank })),
        el('div', { class: 'stat' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'stat' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'stat' }, el('span', { text: '7-day change' }), el('b', { class: row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
        el('div', { class: 'stat' }, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { class: 'stat' }, el('span', { text: 'Chains' }), el('b', { text: String((row.chains || []).length) }))),
      el('div', { class: 'waterfall' },
        el('h3', { text: 'How the implied value is built' }),
        wfRow('TVL × base ' + fmtMult(row.base_multiple), fmtUsd(base), base),
        wfRow('× growth ' + fmtMult(row.growth_multiplier), fmtUsd(afterGrowth), afterGrowth),
        wfRow('× maturity ' + fmtMult(row.maturity_multiplier), fmtUsd(afterMaturity), afterMaturity),
        wfRow('× breadth ' + fmtMult(row.breadth_multiplier), fmtUsd(row.implied_value_usd), row.implied_value_usd),
        el('div', { class: 'wf-total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        wfNote ? el('p', { class: 'sandbox-note', text: wfNote }) : null,
        el('p', { class: 'sandbox-note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })),
      el('div', null,
        el('h3', { class: 'steps-head', text: 'Farm plan — seven steps' }),
        el('ol', { class: 'steps' }, steps.map(function (s) { return el('li', { text: s }); }))),
      neighbours.length ? el('p', { class: 'compare' }, document.createTextNode('Neighbours on the board: '),
        neighbours.map(function (n, i) {
          return el('span', null,
            el('button', { type: 'button', text: '#' + n.rank + ' ' + n.name, onclick: function () { openDetail(n.slug); } }),
            i < neighbours.length - 1 ? document.createTextNode(' · ') : null);
        })) : null,
      el('p', { class: 'caveat', text: 'Read this as a research starting point, not a promise: the snapshot records no token for this protocol, which is not proof it has none, and nothing here predicts whether or when a token is issued, or what it would trade at. Never pay anyone to claim an airdrop, and verify every contract and link on the protocol’s own page.' })));
    if (!dialog.open) dialog.showModal();
  }

  // --- render ----------------------------------------------------------------------
  function render() {
    var ranks = sandboxActive() ? sandboxRanks() : {};
    var shell = el('div', { class: 'shell' }, header(), lede(), controls(ranks));
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'model') shell.appendChild(modelPanel());
    else shell.appendChild(boardTable(ranks));
    if (state.tab !== 'model') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot date ' + DATA.as_of + '; floor $' + DATA.floor_usd.toLocaleString('en-US') + '.' }),
      el('p', { text: 'Implied values are this radar’s own claim from the snapshot’s figures. They are not a prediction of issuance, timing or price, and make.fun makes no claim about them.' })));
    app.replaceChildren(shell);
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
    else if (dialog && dialog.open) dialog.close();
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && dialog.open) { state.selected = null; writeHash(); }
  });
  // A changed address is a new state, even without a reload: pasting a shared
  // link into a live tab applies its filters instead of leaving the old ones.
  window.addEventListener('hashchange', function () { resetState(); readHash(); render(); });
  readHash();
  render();
})();
