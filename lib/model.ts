// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every pre-token protocol the snapshot carries that is not a wrapped, staked or
// bridged product of a token that already trades, and not a versioned pool or an exchange. The
// watchlist is the floor: all 40 of its slugs are ranked, and the radar adds the 158 pre-token
// protocols below the floor that pass the same rule, so the board holds 198 rows. The 144
// pre-token protocols the rule sets aside are listed separately, each with its reason, so the
// reader sees what the radar refused and why.
//
// Implied value follows only from the snapshot's own figures, and it is a fitted size curve, not
// a multiple rule. The program fits, at runtime and from this snapshot's own live-token
// protocols, the relation between a protocol's size (TVL) and its market value:
//
//   log10(market cap) = intercept + slope * log10(TVL) + category adjustment
//
// then prices each pre-token protocol on that curve. A protocol's category adjustment is its live
// neighbours' mean log residual, shrunk toward zero by k = 15 live protocols, so a thin category
// contributes instead of being discarded and a one-protocol category cannot dominate. Two priors
// stay small and unfitted on purpose: fitted growth/age coefficients are unstable across time
// splits, so the model keeps them as priors and says so:
//
//   fitted     = 10 ^ (intercept + slope * log10(tvl_usd) + category adjustment)
//   growthMult = 1 + (clamp(change_7d, -80, 200) / 100) * 0.3
//   maturity   = 0.85 + min(age_days, 1095) / 1095 * 0.15   (age_days unknown: 365)
//   implied    = max(1, round(fitted * growthMult * maturity))
//
// The fit was checked, not guessed: a leave-one-out run over the snapshot's 128 live protocols
// (predict each one's market cap from its TVL and the curve the others imply) gives a mean squared
// log error of 4.50 for the fitted curve with its category adjustment and priors, against 5.65 for
// the count-weighted multiple blend this radar used before, 5.33 for the market median alone and
// 5.93 for a hard category-median rule. The fitted curve's median miss is 3.47x, within 3x for 45%
// of live protocols and within 10x for 81%. A time split (fit on the 44 protocols listed before
// 2024, test on the 51 listed since) gives a median miss of 2.98x, against 5.19x for the old blend
// and 5.20x for the market median. The slope is stable: across the 128 leave-one-out folds it
// runs 0.495 to 0.551, standard deviation 0.008. Growth and age stay small priors, not fitted
// coefficients: across the live protocols with listing dates, neither predicts the
// market-cap-to-TVL ratio (R-squared about 0.03), so the model does not pretend to fit them.
//
// Every farm plan also carries a verdict on a $1,000 deposit: the implied slice of the launch
// (10% of the deposit, priced at the fitted value), minus the gas the plan actually costs, minus
// the 4% T-bill yield the deposit forgoes while it sits. FARM when the net is positive, THIN when
// the slice covers gas but not the forgone yield, SKIP otherwise.
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard
// shows the fitted curve, the scatter it was fitted on and the validation tables, so any reader
// can check the arithmetic.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_multiple: number;
  max_multiple: number;
  /** Live protocols a category needs before its residual adjustment is trusted. */
  category_k: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.3,
  growth_floor: -80,
  growth_cap: 200,
  maturity_floor: 0.85,
  maturity_range: 0.15,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_multiple: 0.05,
  max_multiple: 1.0,
  category_k: 15,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export type Verdict = 'FARM' | 'THIN' | 'SKIP';

/** The fitted value and the $1,000-deposit verdict one row carries. */
export interface RowModel {
  category_multiple: number;
  category_live_n: number;
  /** The category's own median market-cap-to-TVL ratio, before any adjustment; null when the category has no live protocol. */
  category_median: number | null;
  multiple_source: 'blend' | 'market';
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
  fitted_value_usd: number;
  category_adjustment: number;
  category_factor: number;
  category_mean_residual: number;
  slice_usd: number;
  verdict: Verdict;
  verdict_net_usd: number;
  verdict_net_per_hour_usd: number;
  verdict_gas_usd: number;
  verdict_forgone_usd: number;
  hold_days: number;
  active_hours: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: RowModel;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  category_live_n: number;
  /** The category's own median market-cap-to-TVL ratio, before any adjustment; null when the category has no live protocol. */
  category_median: number | null;
  multiple_source: 'blend' | 'market';
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
  model: RowModel;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** A pre-token protocol the rule sets aside, with the reason it is not ranked. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** One line of the calibration table: how a category's adjustment was set. */
export interface CalibrationRow {
  category: string;
  live_n: number;
  /** The category's own median market-cap-to-TVL ratio, before any adjustment; null when the category has no live protocol. */
  category_median: number | null;
  /** Mean log10 residual of the category's live protocols against the fitted curve. */
  mean_residual: number;
  /** The adjustment added to the curve for this category, shrunk toward zero by category_k. */
  adjustment: number;
  /** The adjustment as a multiple: 10 ^ adjustment. */
  factor: number;
  source: 'blend' | 'market';
}

/** The fitted size curve, computed at runtime from the live-token set. */
export interface SizeCurveFit {
  intercept: number;
  slope: number;
  n_live: number;
  residual_sd: number;
  /** Middle 50% band of market-cap / fitted-value, as a multiple. */
  band_low: number;
  band_high: number;
  byCategory: Record<string, { n: number; mean_residual: number; adjustment: number }>;
}

/** The leave-one-out and time-split check of the fitted curve, computed from the snapshot's own live protocols. */
export interface ModelValidation {
  /** Live-token protocols with a positive market cap and TVL. */
  n_live: number;
  /** Mean squared log error predicting each live protocol's market cap from its TVL alone. */
  market_mse: number;
  /** The same, under the hard rule (category median with 3+ live, else the market median). */
  hard_rule_mse: number;
  /** The same, under the old count-weighted multiple blend (k = 3, growth 0.6, maturity 0.7 + 0.3). */
  blend_mse: number;
  /** The same, under the fitted curve alone, no category adjustment, no priors. */
  fit_plain_mse: number;
  /** The same, under the fitted curve with its category adjustment and priors. */
  fit_mse: number;
  /** Median factor by which the fitted curve misses a live protocol's market cap. */
  fit_median_miss: number;
  /** Live protocols the fitted curve prices within 3x. */
  fit_within3: number;
  /** Live protocols the fitted curve prices within 10x. */
  fit_within10: number;
  /** Live protocols listed before 2024, the time-split training set. */
  n_fit: number;
  /** Live protocols listed since 2024, the time-split test set. */
  n_test: number;
  /** Median miss on the time-split test set, fitted curve. */
  time_split_fit_median_miss: number;
  /** Median miss on the time-split test set, old blend. */
  time_split_blend_median_miss: number;
  /** Median miss on the time-split test set, market median. */
  time_split_market_median_miss: number;
  /** Time-split test protocols the fitted curve prices within 3x. */
  time_split_fit_within3: number;
  /** Standard deviation of the fitted slope across the leave-one-out folds. */
  slope_sd: number;
  /** Live protocols with a listing date, used for the growth/age check. */
  n_dated: number;
  /** R-squared of log(mcap/TVL) on log(age) and seven-day growth across the dated live protocols. */
  growth_age_r2: number;
}

/** One point of the scatter the curve was fitted on. */
export interface CompPoint {
  log_tvl: number;
  log_mcap: number;
  recent: boolean;
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, the calibration. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  validation: ModelValidation;
  /** The market-wide median market-cap-to-TVL ratio across the snapshot's live protocols. */
  market_median: number;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  excluded_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
  calibration: CalibrationRow[];
  fit: SizeCurveFit;
  comps: CompPoint[];
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const log10 = (x: number): number => Math.log(x) / Math.LN10;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a product of a token that already trades, not a launch of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol name must not begin with. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole-word wrapped / staked / staking in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Why a pre-token protocol is set aside instead of ranked, or null when it may be ranked.
 * The rule is the watchlist's own, applied to every protocol: a wrapped, staked or bridged
 * product of a token that already trades is not a token that does not exist yet.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'Its token already trades: the market cap is a fact, not a model.';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    if (p.category === 'CEX') return 'Centralised exchange: its token, if any, is the exchange\u2019s own.';
    if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'Bridge: it moves another token, not a launch of its own.';
    return 'Staked product of a token that already trades.';
  }
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped or staked product of a token that already trades.';
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return 'Exchange product: it carries an exchange\u2019s name.';
  if (VERSIONED.test(p.name)) return 'Versioned pool of another protocol.';
  return null;
}

/** Whether a protocol is one the board may rank. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------- the fitted curve

interface LivePoint {
  slug: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
}

/** The live-token protocols the curve is fitted on: every one with a positive market cap and TVL. */
function liveOf(snapshot: Snapshot): LivePoint[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      category: p.category ?? 'Other',
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      listed_at: p.listed_at,
    }));
}

/** Ordinary least squares for log10(market cap) ~ a + b * log10(TVL). */
function ols(points: LivePoint[]): { intercept: number; slope: number } {
  const xs = points.map((p) => log10(p.tvl_usd));
  const ys = points.map((p) => log10(p.mcap_usd));
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** Fit the size curve on a live-token set, with shrunk category residuals. */
function fitOn(points: LivePoint[]): SizeCurveFit {
  const { intercept, slope } = ols(points);
  const residuals = points.map(
    (p) => log10(p.mcap_usd) - (intercept + slope * log10(p.tvl_usd)),
  );
  const byCategory: SizeCurveFit['byCategory'] = {};
  for (const cat of new Set(points.map((p) => p.category))) {
    const res = points
      .filter((p) => p.category === cat)
      .map((p) => log10(p.mcap_usd) - (intercept + slope * log10(p.tvl_usd)));
    byCategory[cat] = {
      n: res.length,
      mean_residual: mean(res),
      adjustment: res.reduce((a, b) => a + b, 0) / (res.length + MODEL.category_k),
    };
  }
  const ratios = points
    .map((p) => p.mcap_usd / 10 ** (intercept + slope * log10(p.tvl_usd)))
    .sort((a, b) => a - b);
  return {
    intercept,
    slope,
    n_live: points.length,
    residual_sd: sd(residuals),
    band_low: quantile(ratios, 0.25),
    band_high: quantile(ratios, 0.75),
    byCategory,
  };
}

function categoryAdjustment(fit: SizeCurveFit, category: string | null): number {
  const entry = category === null ? undefined : fit.byCategory[category];
  return entry ? entry.adjustment : 0;
}

/** The two priors, kept small and unfitted on purpose. */
function priors(
  change_7d: number | null,
  age_days: number | null,
  model: ModelConstants,
): { growth_multiplier: number; maturity_multiplier: number; growth_pct: number } {
  const growth = clamp(
    change_7d === null || change_7d === undefined ? 0 : change_7d,
    model.growth_floor,
    model.growth_cap,
  );
  const growth_multiplier = 1 + (growth / 100) * model.growth_weight;
  const age = age_days === null || age_days === undefined ? model.unknown_age_days : age_days;
  const maturity_multiplier =
    model.maturity_floor +
    (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) *
      model.maturity_range;
  return { growth_multiplier, maturity_multiplier, growth_pct: growth };
}

/** The fitted value of one protocol from its TVL, its category and its priors. */
function fittedValue(
  fit: SizeCurveFit,
  tvl_usd: number,
  category: string | null,
  change_7d: number | null,
  age_days: number | null,
  model: ModelConstants,
): { value: number; adjustment: number; growth_multiplier: number; maturity_multiplier: number; growth_pct: number } {
  const adjustment = categoryAdjustment(fit, category);
  const { growth_multiplier, maturity_multiplier, growth_pct } = priors(change_7d, age_days, model);
  const value = Math.max(
    1,
    Math.round(
      10 ** (fit.intercept + fit.slope * log10(tvl_usd) + adjustment) *
        growth_multiplier *
        maturity_multiplier,
    ),
  );
  return { value, adjustment, growth_multiplier, maturity_multiplier, growth_pct };
}

/** The calibration: one adjustment per category, from the live-token protocols' own residuals. */
export function calibrate(snapshot: Snapshot, model: ModelConstants): { byCategory: Map<string, CalibrationRow>; market: number; fit: SizeCurveFit } {
  const live = liveOf(snapshot);
  const fit = fitOn(live);
  const market = Math.min(model.max_multiple, Math.max(model.min_multiple, median(live.map((p) => p.mcap_usd / p.tvl_usd))));
  const byCategory = new Map<string, CalibrationRow>();
  for (const cat of new Set(live.map((p) => p.category))) {
    const ratios = live.filter((p) => p.category === cat).map((p) => p.mcap_usd / p.tvl_usd);
    const entry = fit.byCategory[cat]!;
    byCategory.set(cat, {
      category: cat,
      live_n: entry.n,
      category_median: Math.min(model.max_multiple, Math.max(model.min_multiple, median(ratios))),
      mean_residual: entry.mean_residual,
      adjustment: entry.adjustment,
      factor: 10 ** entry.adjustment,
      source: 'blend',
    });
  }
  return { byCategory, market, fit };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: { byCategory: Map<string, CalibrationRow>; market: number; fit: SizeCurveFit },
): { implied: number; multiple: number; liveN: number; categoryMedian: number | null; source: 'blend' | 'market'; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const fit = calibration.fit;
  const v = fittedValue(fit, protocol.tvl_usd, protocol.category, protocol.change_7d, age, model);
  const cal = protocol.category === null ? undefined : calibration.byCategory.get(protocol.category);
  const multiple = Math.round((v.value / protocol.tvl_usd) * 1000) / 1000;
  return {
    implied: v.value,
    multiple,
    liveN: cal ? cal.live_n : 0,
    categoryMedian: cal ? cal.category_median : null,
    source: cal ? 'blend' : 'market',
    growthPct: v.growth_pct,
    growthMult: v.growth_multiplier,
    maturityMult: v.maturity_multiplier,
    age,
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// ---------------------------------------------------------------- the farm plan

/** Typical gas for one transaction on a chain, in dollars. */
function gasUsdFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'solana' || c === 'hyperliquid l1' || c === 'hyperliquid') return 0.1;
  if (c === 'binance' || c === 'bsc') return 0.3;
  if (c === 'polygon') return 0.1;
  if (c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'avalanche' || c === 'monad') return 0.5;
  return 2;
}

/** Typical gas for one transaction on a chain, in words. */
function gasFor(chain: string): string {
  const usd = gasUsdFor(chain);
  return usd < 1 ? `about $${usd.toFixed(2)} of gas` : `about $${usd.toFixed(0)} of gas`;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position needs: $1,000 for every protocol, so the verdicts compare. */
function capitalFor(_p: SnapshotProtocol): number {
  return 1000;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action and its second qualifying action, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { action: string; second: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const dep = (what: string): string => `Deposit $${capital} of ${what} into ${name} on ${chain} and keep the position open.`;
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      action: dep('USDC into a vault'),
      second: `Move a second $${Math.round(capital / 2)} into another ${name} vault so the activity spans two strategies.`,
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      action: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
      second: `Borrow $${Math.round(capital / 5)} against the supplied collateral and repay it a week later.`,
    };
  }
  if (c.includes('dex')) {
    return {
      action: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      second: `Swap $${Math.round(capital / 5)} through the same pool once a week so the wallet shows trading as well as liquidity.`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis trading') || c.includes('interest rate')) {
    return {
      action: `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
      second: `Close the hedge after a week and open a fresh one in a second market on ${name}.`,
    };
  }
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) {
    return {
      action: dep('USDC'),
      second: `Compound the yield back into the same vault once, so the wallet shows a second deposit.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      action: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`,
      second: `Check the accrued yield on the protocol's own page once a week and keep the receipt.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      action: `Fund $${capital} and place one market position on ${name}.`,
      second: `Place a second position in a different market once the first one resolves.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      action: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
      second: `Bridge a second, smaller amount back the other way so the wallet shows two-way use.`,
    };
  }
  if (c.includes('chain')) {
    return {
      action: `Bridge $${capital} of USDC to ${name} and use its flagship app with the bridged funds.`,
      second: `Use a second app on the same chain once a week so the wallet's activity is not a single hop.`,
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      action: `Spend $${capital} through ${name} on ${chain} across two or three real payments.`,
      second: `Repeat one payment a week so the wallet shows steady use, not a single spend.`,
    };
  }
  if (c.includes('restak') || c.includes('staking')) {
    return {
      action: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`,
      second: `Restake the receipt token once, so the wallet shows a second staking action.`,
    };
  }
  if (c.includes('stable')) {
    return {
      action: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
      second: `Hold the stable asset in the protocol's savings module for at least a week.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      action: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
      second: `Stake a small amount in one of ${name}'s cover pools alongside the policy.`,
    };
  }
  if (c.includes('index')) {
    return {
      action: `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`,
      second: `Hold through one rebalance so the wallet is counted across two index compositions.`,
    };
  }
  if (c.includes('otc')) {
    return {
      action: `Place a $${capital} quote on ${name} and settle one trade on ${chain}.`,
      second: `Settle a second, smaller trade a week later.`,
    };
  }
  if (c.includes('governance')) {
    return {
      action: `Lock $${capital} of the governance asset through ${name} on ${chain}.`,
      second: `Vote on one live proposal while the lock is open.`,
    };
  }
  if (c.includes('liquidity manager')) {
    return {
      action: `Deposit $${capital} of USDC into a ${name} managed pool on ${chain}.`,
      second: `Let the position ride through one rebalance, then top it up once.`,
    };
  }
  if (c.includes('anchor') || c.includes('decentralized btc')) {
    return {
      action: `Mint $${capital} of the BTC-backed asset through ${name} on ${chain} and hold it.`,
      second: `Use the minted asset once as collateral, then return it to the holding wallet.`,
    };
  }
  return { action: dep('USDC'), second: `Use a second feature of ${name} once a week, such as a swap, a vote or a claim.` };
}

export interface FarmPlan {
  steps: FarmStep[];
  gas_usd: number;
  active_minutes: number;
  hold_days: number;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Step 7 is the exit: how to unwind without losing the position's history. The plan also
 * carries what it costs in gas and in active minutes, so the verdict can price it.
 */
export function buildFarmPlan(p: SnapshotProtocol, age: number | null): FarmPlan {
  const name = p.name;
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasUsd = gasUsdFor(chain);
  const weeks = Math.ceil(hold / 7);
  const until = new Date(Date.now() + hold * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { action, second } = actionsFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet funded with $${capital} for ${name}, holding only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${Math.round(capital / 5)} of capital and ${gas}`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${name}'s own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction for ${name} on ${chain} in a farm log, then unwind in the reverse order you entered so the exit itself is a clean record.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, 15 minutes to unwind',
    },
  ];
  return {
    steps,
    // One transaction to bridge, one to deposit, one for the second action, one per weekly
    // cycle, one to unwind; the hold and the claim check cost no gas.
    gas_usd: gasUsd * (4 + weeks),
    active_minutes: 55 + 10 * weeks,
    hold_days: hold,
  };
}

/** A protocol's farm plan as steps, each an action with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  return buildFarmPlan(p, age).steps;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The $1,000-deposit verdict: slice of the launch, minus gas, minus forgone yield. */
export function verdictFor(implied_value_usd: number, tvl_usd: number, plan: FarmPlan): {
  slice_usd: number;
  verdict: Verdict;
  verdict_net_usd: number;
  verdict_net_per_hour_usd: number;
  verdict_gas_usd: number;
  verdict_forgone_usd: number;
  active_hours: number;
} {
  const slice_usd = (implied_value_usd * 100) / tvl_usd;
  const forgone_usd = 1000 * 0.04 * (plan.hold_days / 365);
  const net_usd = slice_usd - plan.gas_usd - forgone_usd;
  const active_hours = plan.active_minutes / 60;
  const verdict: Verdict =
    net_usd > 0 ? 'FARM' : slice_usd > plan.gas_usd ? 'THIN' : 'SKIP';
  return {
    slice_usd: Math.round(slice_usd * 100) / 100,
    verdict,
    verdict_net_usd: Math.round(net_usd * 100) / 100,
    verdict_net_per_hour_usd: Math.round((net_usd / active_hours) * 100) / 100,
    verdict_gas_usd: Math.round(plan.gas_usd * 100) / 100,
    verdict_forgone_usd: Math.round(forgone_usd * 100) / 100,
    active_hours: Math.round(active_hours * 100) / 100,
  };
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its TVL. The floor is
  // never the whole board: the radar exists to find the early ones too.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    const plan = buildFarmPlan(p, v.age);
    const verdict = verdictFor(v.implied, p.tvl_usd, plan);
    const cal = p.category === null ? undefined : calibration.byCategory.get(p.category);
    return { p, v, plan, verdict, cal };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const fitted = fittedValue(calibration.fit, s.p.tvl_usd, s.p.category, s.p.change_7d, s.v.age, model);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      model: {
        category_multiple: s.v.multiple,
        category_live_n: s.v.liveN,
        category_median: s.v.categoryMedian,
        multiple_source: s.v.source,
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
        fitted_value_usd: fitted.value,
        category_adjustment: fitted.adjustment,
        category_factor: 10 ** fitted.adjustment,
        category_mean_residual: s.cal ? s.cal.mean_residual : 0,
        slice_usd: s.verdict.slice_usd,
        verdict: s.verdict.verdict,
        verdict_net_usd: s.verdict.verdict_net_usd,
        verdict_net_per_hour_usd: s.verdict.verdict_net_per_hour_usd,
        verdict_gas_usd: s.verdict.verdict_gas_usd,
        verdict_forgone_usd: s.verdict.verdict_forgone_usd,
        hold_days: s.plan.hold_days,
        active_hours: s.verdict.active_hours,
      },
      farm_steps: s.plan.steps.map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
}

/** The pre-token protocols the rule sets aside, biggest first, each with its reason. */
export function excludedRows(snapshot: Snapshot): ExcludedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && exclusionReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p)!,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_live_n: row.model.category_live_n,
    category_median: row.model.category_median,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
    model: row.model,
  };
}

// ---------------------------------------------------------------- validation

/** The leave-one-out and time-split check of the fitted curve, and the growth/age check, from the live protocols. */
export function validateModel(snapshot: Snapshot, model: ModelConstants): ModelValidation {
  const live = liveOf(snapshot);
  const clampM = (x: number): number => clamp(x, model.min_multiple, model.max_multiple);
  const marketMed = (others: LivePoint[]): number => clampM(median(others.map((q) => q.mcap_usd / q.tvl_usd)));
  const catRatios = (p: LivePoint, others: LivePoint[]): number[] =>
    others.filter((q) => q.category === p.category).map((q) => q.mcap_usd / q.tvl_usd);
  // The old blend, with its own constants, so the table compares this model against the one it replaces.
  const OLD_BLEND_K = 3;
  const OLD_GROWTH_WEIGHT = 0.6;
  const OLD_GROWTH_FLOOR = -50;
  const OLD_GROWTH_CAP = 100;
  const OLD_MATURITY_FLOOR = 0.7;
  const OLD_MATURITY_RANGE = 0.3;
  const hardRule = (p: LivePoint, others: LivePoint[]): number => {
    const r = catRatios(p, others);
    return r.length >= 3 ? clampM(median(r)) : marketMed(others);
  };
  const blend = (p: LivePoint, others: LivePoint[]): number => {
    const r = catRatios(p, others);
    const market = marketMed(others);
    if (r.length === 0) return market;
    const catMedian = clampM(median(r));
    return clampM((r.length * catMedian + OLD_BLEND_K * market) / (r.length + OLD_BLEND_K));
  };
  const blendValue = (p: LivePoint, others: LivePoint[]): number => {
    const growth = clamp(p.change_7d ?? 0, OLD_GROWTH_FLOOR, OLD_GROWTH_CAP);
    const growthMult = 1 + (growth / 100) * OLD_GROWTH_WEIGHT;
    const age = p.age_days ?? model.unknown_age_days;
    const maturityMult =
      OLD_MATURITY_FLOOR +
      (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * OLD_MATURITY_RANGE;
    return Math.max(1, Math.round(p.tvl_usd * blend(p, others) * growthMult * maturityMult));
  };
  const sqLog = (predicted: number, actual: number): number => {
    const err = Math.log(predicted) - Math.log(actual);
    return err * err;
  };

  let marketSq = 0;
  let hardSq = 0;
  let blendSq = 0;
  let fitPlainSq = 0;
  let fitSq = 0;
  const fitMiss: number[] = [];
  let fitWithin3 = 0;
  let fitWithin10 = 0;
  const slopes: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const held = live[i]!;
    const rest = live.filter((_, j) => j !== i);
    const fit = fitOn(rest);
    slopes.push(fit.slope);
    const plain = 10 ** (fit.intercept + fit.slope * log10(held.tvl_usd));
    const fitted = fittedValue(fit, held.tvl_usd, held.category, held.change_7d, held.age_days, model).value;
    marketSq += sqLog(marketMed(rest) * held.tvl_usd, held.mcap_usd);
    hardSq += sqLog(hardRule(held, rest) * held.tvl_usd, held.mcap_usd);
    blendSq += sqLog(blendValue(held, rest), held.mcap_usd);
    fitPlainSq += sqLog(plain, held.mcap_usd);
    fitSq += sqLog(fitted, held.mcap_usd);
    const miss = Math.max(fitted / held.mcap_usd, held.mcap_usd / fitted);
    fitMiss.push(miss);
    if (miss <= 3) fitWithin3++;
    if (miss <= 10) fitWithin10++;
  }
  const n = live.length;
  fitMiss.sort((a, b) => a - b);

  // Time split: fit on protocols listed before 2024, test on those listed since.
  const pre = live.filter((p) => p.listed_at !== null && p.listed_at < '2024-01-01');
  const post = live.filter((p) => p.listed_at !== null && p.listed_at >= '2024-01-01');
  const preFit = fitOn(pre);
  const tsFitMiss: number[] = [];
  const tsBlendMiss: number[] = [];
  const tsMarketMiss: number[] = [];
  let tsFitWithin3 = 0;
  for (const p of post) {
    const fitted = fittedValue(preFit, p.tvl_usd, p.category, p.change_7d, p.age_days, model).value;
    const missF = Math.max(fitted / p.mcap_usd, p.mcap_usd / fitted);
    const missB = Math.max(blendValue(p, pre) / p.mcap_usd, p.mcap_usd / blendValue(p, pre));
    const missM = Math.max((marketMed(pre) * p.tvl_usd) / p.mcap_usd, p.mcap_usd / (marketMed(pre) * p.tvl_usd));
    tsFitMiss.push(missF);
    tsBlendMiss.push(missB);
    tsMarketMiss.push(missM);
    if (missF <= 3) tsFitWithin3++;
  }
  tsFitMiss.sort((a, b) => a - b);
  tsBlendMiss.sort((a, b) => a - b);
  tsMarketMiss.sort((a, b) => a - b);

  // R-squared of log(mcap/TVL) on log(age) and seven-day growth, dated live protocols only.
  let nDated = 0;
  let r2 = 0;
  {
    const rows: Array<[number, number, number]> = [];
    for (const p of live) {
      if (p.age_days === null || p.change_7d === null) continue;
      rows.push([Math.log(Math.max(1, p.age_days)), p.change_7d, Math.log(p.mcap_usd / p.tvl_usd)]);
    }
    nDated = rows.length;
    if (nDated >= 10) {
      // Ordinary least squares with an intercept: solve the 3x3 normal equations.
      const X = rows.map(([a, g]) => [1, a, g]);
      const y = rows.map(([, , v]) => v);
      const k = 3;
      const A: number[][] = [];
      for (let a = 0; a < k; a++) {
        const row: number[] = [];
        for (let b = 0; b < k; b++) row.push(X.reduce((s, r) => s + r[a]! * r[b]!, 0));
        row.push(X.reduce((s, r, i) => s + r[a]! * y[i]!, 0));
        A.push(row);
      }
      for (let i = 0; i < k; i++) {
        let piv = i;
        for (let r = i + 1; r < k; r++) if (Math.abs(A[r]![i]) > Math.abs(A[piv]![i])) piv = r;
        const tmp = A[i]!;
        A[i] = A[piv]!;
        A[piv] = tmp;
        const d = A[i]![i]!;
        A[i] = A[i]!.map((v) => v / d);
        for (let r = 0; r < k; r++) {
          if (r === i) continue;
          const f = A[r]![i]!;
          A[r] = A[r]!.map((v, c) => v - f * A[i]![c]!);
        }
      }
      const beta = A.map((r) => r[k]!);
      const meanY = y.reduce((s, v) => s + v, 0) / y.length;
      let ssRes = 0;
      let ssTot = 0;
      for (let i = 0; i < y.length; i++) {
        const pred = beta[0]! + beta[1]! * X[i]![1]! + beta[2]! * X[i]![2]!;
        ssRes += (y[i]! - pred) ** 2;
        ssTot += (y[i]! - meanY) ** 2;
      }
      r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    }
  }

  const med = (arr: number[]): number => arr[Math.floor(arr.length / 2)];
  return {
    n_live: n,
    market_mse: marketSq / n,
    hard_rule_mse: hardSq / n,
    blend_mse: blendSq / n,
    fit_plain_mse: fitPlainSq / n,
    fit_mse: fitSq / n,
    fit_median_miss: med(fitMiss),
    fit_within3: fitWithin3,
    fit_within10: fitWithin10,
    n_fit: pre.length,
    n_test: post.length,
    time_split_fit_median_miss: med(tsFitMiss),
    time_split_blend_median_miss: med(tsBlendMiss),
    time_split_market_median_miss: med(tsMarketMiss),
    time_split_fit_within3: tsFitWithin3,
    slope_sd: sd(slopes),
    n_dated: nDated,
    growth_age_r2: r2,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot);
  const calibrationRows: CalibrationRow[] = [...calibration.byCategory.values()]
    .sort((a, b) => b.live_n - a.live_n || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const liveAll = liveOf(snapshot);
  const comps: CompPoint[] = liveAll.map((p) => ({
    log_tvl: log10(p.tvl_usd),
    log_mcap: log10(p.mcap_usd),
    recent: p.listed_at !== null && p.listed_at >= '2024-01-01',
  }));
  const verdict_counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdict_counts[r.model.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    validation: validateModel(snapshot, model),
    market_median: calibration.market,
    watchlist: snapshot.watchlist.slice(),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    excluded_size: excluded.length,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    excluded,
    calibration: calibrationRows,
    fit: calibration.fit,
    comps,
    verdict_counts,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
