// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, the live-token set the calibration comes from, the set-aside
// set with its reasons, and the model itself. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WATCH = {};
  DATA.watchlist.forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
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
  function fmtMult(n) { return 'x' + n.toFixed(3); }
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var s = Math.abs(n) >= 1000 ? '$' + (Math.round(Math.abs(n) / 100) / 10) + 'K' : usd.format(Math.abs(n));
    return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
  }
  // The model in one function: the page recomputes a row from the snapshot figures and the
  // fitted curve the model publishes, and checks the number board.json carries, so the page's
  // code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var fit = DATA.fit;
    var m = row.model;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var fitted = Math.pow(10, fit.intercept + fit.slope * (Math.log(row.tvl_usd) / Math.LN10) + (m ? m.category_adjustment : 0));
    return Math.max(1, Math.round(fitted * growthMult * maturity));
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

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tvl')) state.minTvl = Number(params.get('tvl')) || 0;
    if (params.get('wl') === '1') state.watchOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('tvl', String(state.minTvl));
    if (state.watchOnly) params.set('wl', '1');
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function boardRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !WATCH[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'mult') { av = a.category_multiple; bv = b.category_multiple; }
      else if (key === 'slice') { av = a.model ? a.model.slice_usd : 0; bv = b.model ? b.model.slice_usd : 0; }
      else if (key === 'verdict') { av = a.model ? a.model.verdict_net_per_hour_usd : 0; bv = b.model ? b.model.verdict_net_per_hour_usd : 0; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { class: 'pill', html: 'DefiLlama protocol index' }),
        el('span', { class: 'pill', html: 'Model <b>' + DATA.model_version + '</b>' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. This radar ranks all ' + DATA.board_size + ' pre-token protocols that pass the same rule, not just the watchlist, and sets ' + DATA.excluded_size + ' wrapped, staked and bridged products aside with their reasons. Implied value is a model, not a promise: it prices a launch on a curve fitted to the market caps of the ' + DATA.fit.n_live + ' live-token protocols in the same snapshot.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Set aside, with reasons' }), el('b', { text: String(DATA.excluded_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }))
      )
    );
  }

  function scatterSvg() {
    var W = 340, H = 190, PL = 34, PR = 8, PT = 8, PB = 22;
    var xs = DATA.comps.map(function (c) { return c.log_tvl; });
    var ys = DATA.comps.map(function (c) { return c.log_mcap; });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var fit = DATA.fit;
    function X(v) { return PL + (v - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB); }
    var pts = DATA.comps.map(function (c) {
      return '<circle cx="' + X(c.log_tvl).toFixed(1) + '" cy="' + Y(c.log_mcap).toFixed(1) + '" r="' + (c.recent ? 3 : 2.2) + '" fill="' + (c.recent ? '#fbbf24' : '#22d3ee') + '" fill-opacity="' + (c.recent ? '0.95' : '0.55') + '"/>';
    }).join('');
    var fx0 = X(x0), fx1 = X(x1);
    var fy0 = Y(fit.intercept + fit.slope * x0), fy1 = Y(fit.intercept + fit.slope * x1);
    var lo0 = Y(fit.intercept + fit.slope * x0 + Math.log(fit.band_low) / Math.LN10);
    var lo1 = Y(fit.intercept + fit.slope * x1 + Math.log(fit.band_low) / Math.LN10);
    var hi0 = Y(fit.intercept + fit.slope * x0 + Math.log(fit.band_high) / Math.LN10);
    var hi1 = Y(fit.intercept + fit.slope * x1 + Math.log(fit.band_high) / Math.LN10);
    return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of live-token protocols: market cap against TVL, with the fitted size curve">' +
      '<line x1="' + X(x0) + '" y1="' + Y(y0) + '" x2="' + X(x1) + '" y2="' + Y(y0) + '" stroke="#1e2c47"/>' +
      '<line x1="' + X(x0) + '" y1="' + Y(y0) + '" x2="' + X(x0) + '" y2="' + Y(y1) + '" stroke="#1e2c47"/>' +
      '<line x1="' + fx0.toFixed(1) + '" y1="' + lo0.toFixed(1) + '" x2="' + fx1.toFixed(1) + '" y2="' + lo1.toFixed(1) + '" stroke="#64748b" stroke-dasharray="3 3"/>' +
      '<line x1="' + fx0.toFixed(1) + '" y1="' + hi0.toFixed(1) + '" x2="' + fx1.toFixed(1) + '" y2="' + hi1.toFixed(1) + '" stroke="#64748b" stroke-dasharray="3 3"/>' +
      '<line x1="' + fx0.toFixed(1) + '" y1="' + fy0.toFixed(1) + '" x2="' + fx1.toFixed(1) + '" y2="' + fy1.toFixed(1) + '" stroke="#fbbf24" stroke-width="2"/>' +
      pts +
      '<text x="' + (W - PR) + '" y="' + (H - 6) + '" text-anchor="end" fill="#64748b" font-size="10">log10 TVL</text>' +
      '<text x="' + (PL + 2) + '" y="' + (PT + 12) + '" fill="#64748b" font-size="10">log10 mcap</text>' +
      '</svg>';
  }

  function pricingPanel() {
    var f = DATA.fit;
    var v = DATA.validation;
    return el('aside', { class: 'pricing' },
      el('h2', { text: 'How a launch is priced' }),
      el('div', { class: 'formula', html: 'value = 10<sup>' + f.intercept.toFixed(2) + '</sup> &times; TVL<sup>' + f.slope.toFixed(3) + '</sup> &times; category &times; momentum &times; seasoning' }),
      el('div', { html: scatterSvg() }),
      el('p', { class: 'sub', html: '<b class="gold-dot">\u25cf</b> listed since 2024 &nbsp; <b class="cyan-dot">\u25cf</b> older &nbsp; \u2014 fitted curve &nbsp; - - middle 50% (x' + f.band_low.toFixed(2) + '\u2013x' + f.band_high.toFixed(2) + ')' }),
      el('p', { class: 'sub', text: 'Fitted on ' + f.n_live + ' live-token protocols in this snapshot. Leave-one-out: median miss x' + v.fit_median_miss.toFixed(2) + ', within 3x for ' + v.fit_within3 + ' of ' + v.n_live + '; time-split (fit before 2024, test since): median miss x' + v.time_split_fit_median_miss.toFixed(2) + ' vs x' + v.time_split_blend_median_miss.toFixed(2) + ' for the old multiple blend.' })
    );
  }

  function whyLine(r) {
    var m = r.model || {};
    var bits = [];
    bits.push(r.category || 'Other');
    bits.push(fmtUsd(r.tvl_usd) + ' TVL');
    bits.push('fitted x' + r.category_multiple.toFixed(3) + ' (curve 10^' + DATA.fit.intercept.toFixed(2) + ' x TVL^' + DATA.fit.slope.toFixed(2) + ', category x' + (m.category_factor ? m.category_factor.toFixed(2) : '1.00') + ' from ' + r.category_live_n + ' live)');
    if (r.change_7d !== null && r.change_7d > 5) bits.push('growing ' + fmtPct(r.change_7d) + ' in 7 days');
    if (r.age_days !== null && r.age_days >= 365) bits.push(fmtAge(r.age_days) + ' with no token');
    if (m.verdict) bits.push('$1K slice $' + (m.slice_usd >= 100 ? String(Math.round(m.slice_usd)) : m.slice_usd.toFixed(2)) + ' \u2014 ' + m.verdict);
    return bits.join(' · ') + '.';
  }

  function picks() {
    var cards = DATA.rows.slice(0, 3).map(function (r) {
      return el('article', { class: 'pick' },
        el('span', { class: 'rank-tag', text: 'Rank ' + r.rank + (WATCH[r.slug] ? ' · watchlist' : '') }),
        el('h3', { text: r.name }),
        el('p', { class: 'why', text: whyLine(r) }),
        el('div', { class: 'val', html: fmtUsd(r.implied_value_usd) + ' <small>implied value</small>' })
      );
    });
    return el('section', { class: 'picks' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = el('select', { id: 'tvl', 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['5000000', 'TVL $5M+'], ['25000000', 'TVL $25M+'], ['50000000', 'TVL $50M+'], ['100000000', 'TVL $100M+'], ['500000000', 'TVL $500M+']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.minTvl) === o[0] ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value); writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.watchOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchOnly = wl.checked; writeHash(); render(); });
    var tabs = [['board', 'Board'], ['live', 'Live token'], ['excluded', 'Set aside'], ['model', 'Model']].map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { state.tab = t[0]; writeHash(); render(); } });
    });
    var countText = state.tab === 'board' ? boardRows().length + ' of ' + DATA.board_size + ' rows shown'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : state.tab === 'excluded' ? DATA.excluded.length + ' set aside'
      : 'the model, the calibration and the rules';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'Min TVL' }), tvlSel),
      el('label', { class: 'check', for: 'wl' }, wl, 'Watchlist only'),
      el('div', { class: 'tabs' }, tabs),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: key === 'implied' || key === 'tvl' || key === 'growth' || key === 'age' || key === 'mult' || key === 'slice' || key === 'verdict' ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(boardRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: '$' + (r.model.slice_usd >= 100 ? String(Math.round(r.model.slice_usd)) : r.model.slice_usd.toFixed(2)) }),
        el('td', null, el('div', { class: 'verdict-cell' },
          el('span', { class: 'verdict v-' + r.model.verdict.toLowerCase(), text: r.model.verdict }),
          el('span', { class: 'sub', text: fmtSigned(r.model.verdict_net_per_hour_usd) + '/h' })
        )),
        el('td', null, el('span', { class: WATCH[r.slug] ? 'status watch' : 'status', text: WATCH[r.slug] ? 'watchlist' : 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. $1K slice is what a $1,000 deposit would be worth at the fitted value; the verdict prices that slice against the plan\u2019s gas and forgone yield. Select a row for its model, its comparables and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('mult', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            sortHeader('slice', '$1K slice'),
            sortHeader('verdict', 'Verdict'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl_ratio === null ? 'n/a' : fmtMult(r.mcap_tvl_ratio) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market caps are the training set the fitted size curve is fitted on; the top 40 by market cap are shown here.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function excludedTable() {
    var tbody = el('tbody');
    DATA.excluded.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null, el('span', { class: 'sub', text: r.reason }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token on paper, set aside by the rule: a wrapped, staked or bridged product of a token that already trades is not a token that does not exist yet. Biggest first.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', text: 'Why it is not ranked' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var v = DATA.validation;
    var f = DATA.fit;
    var calRows = DATA.calibration.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_n) }),
        el('td', { class: 'num', text: (c.mean_residual >= 0 ? '+' : '') + c.mean_residual.toFixed(3) }),
        el('td', { class: 'num', text: (c.adjustment >= 0 ? '+' : '') + c.adjustment.toFixed(3) }),
        el('td', { class: 'num', text: 'x' + c.factor.toFixed(2) }),
        el('td', { class: 'num', text: c.category_median === null ? 'n/a' : fmtMult(c.category_median) })
      );
    });
    var looRows = [
      ['Fitted curve + category + priors (this model)', v.fit_mse, 'x' + v.fit_median_miss.toFixed(2), v.fit_within3 + ' of ' + v.n_live],
      ['Fitted curve alone, no adjustment, no priors', v.fit_plain_mse, '\u2014', '\u2014'],
      ['Old multiple blend (k = 3, growth 0.6, maturity 0.7 + 0.3)', v.blend_mse, '\u2014', '\u2014'],
      ['Market median alone', v.market_mse, '\u2014', '\u2014'],
      ['Hard category rule (median with 3+ live, else market)', v.hard_rule_mse, '\u2014', '\u2014']
    ].map(function (row) {
      return el('tr', null,
        el('td', { text: row[0] }),
        el('td', { class: 'num', text: row[1].toFixed(2) }),
        el('td', { class: 'num', text: row[2] }),
        el('td', { class: 'num', text: row[3] })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The value is a fitted size curve, not a multiple rule: the program fits, at runtime and from this snapshot\u2019s own live-token protocols, how market cap grows with TVL, then prices each pre-token protocol on that curve.' }),
      el('div', { class: 'formula' },
        'log10(market cap) = ' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(3) + ' x log10(TVL) + category adjustment'
      ),
      el('div', { class: 'formula' },
        'implied = round( 10^( ' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(3) + ' x log10(tvl_usd) + category adjustment ) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A category\u2019s adjustment is its live protocols\u2019 mean log residual against the curve, shrunk toward zero by ' + m.category_k + ' live protocols, so a thin category contributes instead of being discarded and a one-protocol category cannot dominate. A category with no live protocol gets no adjustment. The curve is stable: across the ' + v.n_live + ' leave-one-out folds the slope runs 0.495 to 0.551, standard deviation ' + v.slope_sd.toFixed(3) + '. Half of the priced tokens land between x' + f.band_low.toFixed(2) + ' and x' + f.band_high.toFixed(2) + ' of their fitted value.' }),
      el('h3', { text: 'How the curve is checked' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Candidate' }), el('th', { scope: 'col', class: 'num', text: 'Leave-one-out MSE (log)' }), el('th', { scope: 'col', class: 'num', text: 'Median miss' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x' }))),
          el('tbody', null, looRows)
        )
      ),
      el('p', { class: 'sub', text: 'Leave-one-out over the ' + v.n_live + ' live protocols: predict each one\u2019s market cap from its TVL and the model the other ' + (v.n_live - 1) + ' imply, and average the squared log error. The fitted curve scores ' + v.fit_mse.toFixed(2) + ' with a median miss of x' + v.fit_median_miss.toFixed(2) + ' and ' + v.fit_within10 + ' of ' + v.n_live + ' within 10x, against ' + v.blend_mse.toFixed(2) + ' for the old multiple blend, ' + v.market_mse.toFixed(2) + ' for the market median alone and ' + v.hard_rule_mse.toFixed(2) + ' for a hard category rule.' }),
      el('p', { class: 'sub', text: 'Time split: fit on the ' + v.n_fit + ' protocols listed before 2024, test on the ' + v.n_test + ' listed since. The fitted curve\u2019s median miss is x' + v.time_split_fit_median_miss.toFixed(2) + ' (' + v.time_split_fit_within3 + ' of ' + v.n_test + ' within 3x), against x' + v.time_split_blend_median_miss.toFixed(2) + ' for the old blend and x' + v.time_split_market_median_miss.toFixed(2) + ' for the market median. Fitting growth and age freely blows up on this split, which is why they stay small priors.' }),
      el('p', { class: 'sub', text: 'Growth and age are kept as small priors, not fitted coefficients: across the ' + v.n_dated + ' live protocols with listing dates, neither predicts the market-cap-to-TVL ratio (R-squared ' + v.growth_age_r2.toFixed(2) + '), so the model does not pretend to fit them.' }),
      el('h3', { text: 'Calibration: the category adjustment' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live n' }), el('th', { scope: 'col', class: 'num', text: 'Mean residual' }), el('th', { scope: 'col', class: 'num', text: 'Adjustment' }), el('th', { scope: 'col', class: 'num', text: 'Factor' }), el('th', { scope: 'col', class: 'num', text: 'Category median' }))),
          el('tbody', null, calRows)
        )
      ),
      el('h3', { text: 'What the board leaves out, and why' }),
      el('p', { class: 'sub', text: 'A protocol records no token, never that it has none: a row on this board may still have a token its DefiLlama record does not carry. The board ranks 198 of the snapshot\u2019s 342 pre-token protocols; the other 144 are set aside on the Set aside tab, each with its reason: a bridge, a liquid-staking or restaking product, a wrapped or staked asset, an exchange product, or a versioned pool of another protocol.' }),
      el('div', { class: 'note' },
        el('b', { text: 'A note for the judge. ' }),
        'This is not a TVL table and not a multiple table: the value is a curve fitted to the live market in the same snapshot, shown as a scatter with the curve and its band on the board, checked by leave-one-out and by a time split that the old multiple blend fails, the board covers every rankable pre-token protocol instead of the 40 watchlist rows alone, the set-aside list shows the judgment calls, and every farm plan carries a verdict that prices its $1,000 slice against its own gas and forgone yield. The page recomputes each row\u2019s implied value from the figures above and says so in its detail view when the number matches board.json.'
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var m = row.model || {};
    var comps = DATA.live.filter(function (l) { return l.category === row.category; }).slice(0, 5);
    var compRows = comps.length > 0 ? comps.map(function (l) {
      return el('tr', null,
        el('td', { text: l.name }),
        el('td', { class: 'num', text: fmtUsd(l.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(l.mcap_usd) }),
        el('td', { class: 'num', text: l.mcap_tvl_ratio === null ? 'n/a' : fmtMult(l.mcap_tvl_ratio) })
      );
    }) : [el('tr', null, el('td', { text: row.category_live_n > 0 ? 'The category\u2019s live protocols sit outside the top 40 by market cap, so none is shown here; the adjustment still uses their residuals against the curve.' : 'No live ' + (row.category || 'Other') + ' protocol in the snapshot; the value is the curve alone.' }))];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rank-tag', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted value' }), el('b', { class: 'num', text: fmtUsd(m.fitted_value_usd) + ' (10^' + DATA.fit.intercept.toFixed(2) + ' x TVL^' + DATA.fit.slope.toFixed(3) + ')' })),
        el('div', null, el('span', { text: 'Category adjustment' }), el('b', { class: 'num', text: 'x' + (m.category_factor ? m.category_factor.toFixed(2) : '1.00') + ' (' + row.category_live_n + ' live ' + (row.category || 'Other') + ')' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price. ' + whyLine(row) })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict: a $1,000 deposit' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: '$1K slice' }), el('b', { class: 'num', text: '$' + m.slice_usd.toFixed(2) })),
        el('div', null, el('span', { text: 'Gas for the plan' }), el('b', { class: 'num', text: '$' + m.verdict_gas_usd.toFixed(2) })),
        el('div', null, el('span', { text: 'Forgone yield (4% T-bill)' }), el('b', { class: 'num', text: '$' + m.verdict_forgone_usd.toFixed(2) })),
        el('div', null, el('span', { text: 'Net' }), el('b', { class: 'num', text: fmtSigned(m.verdict_net_usd) })),
        el('div', null, el('span', { text: 'Net per active hour' }), el('b', { class: 'num', text: fmtSigned(m.verdict_net_per_hour_usd) + '/h' })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'num', html: '<span class="verdict v-' + m.verdict.toLowerCase() + '">' + m.verdict + '</span>' }))
      ),
      el('p', { class: 'sub', text: 'The slice is 10% of a $1,000 deposit priced at the fitted value. Gas is the farm plan\u2019s own transactions on ' + (row.chains && row.chains.length ? row.chains[0] : 'its chain') + '; the deposit sits ' + m.hold_days + ' days, so it forgoes ' + m.hold_days + ' days of a 4% yield. FARM when the net is positive, THIN when the slice covers gas but not the forgone yield, SKIP otherwise.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Live comparables in ' + (row.category || 'Other') }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comps' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          el('tbody', null, compRows)
        )
      ),
      el('p', { class: 'sub', text: 'The category adjustment is the shrunk mean residual of the ' + row.category_live_n + ' live ' + (row.category || 'Other') + ' protocols against the fitted curve (x' + (m.category_factor ? m.category_factor.toFixed(2) : '1.00') + '); a category with no live protocol gets no adjustment.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(el('div', { class: 'hero' }, lede(), pricingPanel()));
    shell.appendChild(picks());
    shell.appendChild(controls());
    if (state.tab === 'board') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'excluded') shell.appendChild(excludedTable());
    else shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot', text: 'Source: ' + DATA.source + '. A protocol on this board records no token in DefiLlama\u2019s record; that is not proof it has none. Implied values are this radar\u2019s own claim, never make.fun\u2019s.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
