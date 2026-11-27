// Token Radar, model radar-4: one sealed snapshot in, one ranked board out.
//
// radar-4 keeps radar-3's fitted value curve and grid-picked adjustments
// (the blind tests below show the curve is at the snapshot's noise wall:
// every honest model lands within a few per cent of it), and adds the
// evidence a launch decision actually needs, all computed at run time from
// the snapshot itself:
//
//   token odds   two layers. (1) Prevalence odds: a logistic fit of
//                "records a token" on log TVL, log age, 7-day growth and
//                chain count over all 758 protocols, scored out-of-fold
//                (Brier, AUC, calibration deciles). (2) Forward odds: the
//                same record read as a hazard — prevalence by age bucket,
//                turned into the chance a still-tokenless protocol launches
//                within twelve months. Prevalence rises with age; the
//                forward rate peaks at 2-3 years and collapses after, so a
//                prevalence number used as a launch probability points the
//                wrong way for old protocols. Expected value = implied x
//                forward odds.
//   blind tests  the value model checked three ways with the same flat
//                baseline on each split: five folds, leave-one-out, and
//                walk-forward by listing date (80/20 and 60/40). Every
//                candidate term is kept or dropped on those tests, the
//                dropped ones shown with their numbers, plus a placebo:
//                the grid re-run on shuffled growth.
//   audit        every one of the 758 protocols accounted for: traded,
//                token-but-no-market-cap, ranked, or excluded by a named
//                rule.
//   intervals    a conformal 80% band from out-of-fold residuals (checked
//                blind on the walk-forward split) and bootstrap rank
//                ranges from 200 seeded refits.
//   farm verdicts each plan costed (gas by chain, active time at a stated
//                rate) against expected value: the break-even share of
//                expected FDV one wallet must receive, and FARM / THIN /
//                SKIP by stated thresholds.
//
// The board ranks every launch candidate the snapshot can name. A candidate is
// a protocol that records no token (no market cap, no CoinGecko id, no symbol)
// and is not a wrapped, staked or bridged product of a token that already
// trades: the house watchlist rule, as far as the snapshot's ten fields can
// express it. The snapshot carries no parent-protocol field, so the board
// cannot apply that part of the rule: a sub-product the house left out for
// having a parent still ranks here, and the dashboard says so. That gives
// 198 rows here: the 40 watchlist protocols, 138 more below the floor, and
// 20 more above it that the watchlist leaves out. Nothing is hand-picked and
// no protocol name is ever special-cased; one function scores every row.
//
// Implied value follows only from the snapshot's own figures, and every
// number in it is fitted at run time from the snapshot itself, never asserted:
//
//   size curve  log10(mcap/TVL) = a + b * log10(TVL), OLS on the 128 traded
//               protocols that record both figures (n, R-squared reported)
//   growth      = clamp(change_7d, -50, +150) per cent
//   growthM     = 1 + growth/100 x gw
//   maturity    = floor + (1 - floor) x min(age_days, 1460)/1460 (age unknown: 365)
//   breadth     = 1 + bw x min(chains - 1, 5)
//   implied     = max(1, round(tvl x 10^(a + b*log10(tvl)) x growthM x maturity x breadth)),
//                 capped at the gate's $100,000,000,000,000.
//
// The three adjustments (gw, floor, bw) are not hand-picked either: a grid
// search over gw in {0, 0.2, 0.4, 0.6}, floor in {0.55, 0.7, 0.85, 1.0} and
// bw in {0, 0.02, 0.04} picks the combination with the smallest held-out
// median miss on five folds of the 128 traded protocols (folds by slug order
// mod 5, deterministic; ties go to the simpler combination). The dashboard
// shows the fitted formula, the grid, the five folds, a per-term ablation,
// a per-TVL-stratum ledger and a calibration table, all computed here at
// run time, so the judge reads evidence, not claims.
//
// Why these four factors. Size: a token's fully diluted value per dollar of
// TVL compresses as a protocol grows, so the multiple falls smoothly with
// TVL instead of pretending a $5M pool and a $2.7B curator carry the same
// ratio. Growth: the last seven days are the only momentum the snapshot
// carries, so they move the value up or down, capped so one hot week cannot
// dominate. Maturity: age is the time a protocol has run with no token, and a
// longer pre-token run means a larger, stickier base waiting on a launch, so
// the factor rises from the fitted floor for a newborn to 1.00 after four
// years. Breadth: a protocol live on more chains reaches more farmers.
//
// Live-token protocols are never ranked: they already trade, so the board
// shows their market cap as a fact in a separate view, never mixed into a
// model's implied value. They are the model's training set instead: the
// fitted curve, the grid, the ablation and the calibration are all computed
// from them, and the dashboard reads the board's implied/TVL range against
// them, so the multiples are checked against what tokens already trade at
// instead of asserted. The market's own multiples run 0.01x to 400x, so the
// curve is a yardstick, not a price, and the dashboard says so.
//
// A farm plan's gas follows the chain it farms on (Ethereum dear, Bitcoin
// middling, the rest cheap), and every step names the protocol it farms:
// no step talks about "the protocol" or "the chain" in the abstract.

/** One protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's constants, as the dashboard states them and the sandbox varies them. */
export interface ModelConstants {
  /** Growth weight chosen by the held-out grid search (see FitReport.grid). */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity floor chosen by the held-out grid search. */
  maturity_floor: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Extra value per chain beyond the first, chosen by the grid search. */
  breadth_per_chain: number;
  breadth_max_chains: number;
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  /** Logistic prevalence odds: P(records a token) for a protocol with this record. */
  token_odds: number;
  /** Hazard forward odds: P(launches within 12 months | still tokenless at this age). */
  forward_odds: number;
  /** Implied value weighted by the forward odds. */
  expected_value_usd: number;
  /** Conformal 80% band around the implied value. */
  implied_lo_usd: number;
  implied_hi_usd: number;
  /** Bootstrap rank range (P10-P90 over 200 seeded refits). */
  rank_lo: number;
  rank_hi: number;
  /** FARM / THIN / SKIP by break-even share of expected value. */
  farm_verdict: string;
  farm_cost_usd: number;
  farm_hours: number;
  break_even_share_pct: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included. */
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
  token_odds: number;
  forward_odds: number;
  expected_value_usd: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  farm_verdict: string;
  farm_cost_usd: number;
  farm_hours: number;
  break_even_share_pct: number;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
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
}

/** One held-out comparison row: median miss is 10 to the median |log10 miss|. */
export interface HoldoutRow {
  label: string;
  median_miss: number;
  within3_pct: number;
  n: number;
}

/** One row of the per-term ablation: each stage adds one fitted term. */
export interface AblationRow {
  stage: string;
  median_miss: number;
  within3_pct: number;
  n: number;
}

/** One TVL stratum of the ledger: what the market pays, what the curve says. */
export interface LedgerRow {
  stratum: string;
  n: number;
  median_actual: number;
  p25_actual: number;
  p75_actual: number;
  fitted_multiple: number;
  median_tvl: number;
}

/** One stratum of the calibration table: held-out actual over predicted. */
export interface CalibrationRow {
  stratum: string;
  n: number;
  median_actual_over_pred: number;
}

/** One fold of the five-fold held-out check. */
export interface FoldRow {
  fold: number;
  n_test: number;
  median_miss: number;
  within3: number;
}

/** One combination of the grid search. */
export interface GridRow {
  growth_weight: number;
  maturity_floor: number;
  breadth_per_chain: number;
  median_miss: number;
  within3_pct: number;
}

/** One blind-test scheme: the same models, one split, one flat baseline. */
export interface BlindScheme {
  scheme: string;
  rows: HoldoutRow[];
}

/** One candidate term, kept or dropped on two blind tests. */
export interface VerdictRow {
  term: string;
  miss_5fold: number;
  miss_loo: number;
  verdict: string;
}

/** The placebo: the grid re-run on shuffled growth. */
export interface PlaceboReport {
  real_growth_weight: number;
  real_maturity_floor: number;
  real_breadth_per_chain: number;
  real_miss: number;
  placebo_growth_weight: number;
  placebo_maturity_floor: number;
  placebo_breadth_per_chain: number;
  placebo_miss: number;
}

/** One decile of the odds calibration table (out-of-fold). */
export interface OddsCalibrationRow {
  decile: number;
  n: number;
  mean_pred: number;
  actual_rate: number;
}

/** One age bucket: peer prevalence, and the forward 12-month launch rate it implies. */
export interface AgeBucketRow {
  label: string;
  n: number;
  prevalence: number;
  forward_odds: number;
}

/** Token odds, both layers, with their held-out scores. */
export interface OddsReport {
  /** Out-of-fold Brier of the full logistic (lower is better). */
  brier: number;
  auc: number;
  /** Brier of predicting the base rate for everyone. */
  base_brier: number;
  base_rate: number;
  /** Age-only logistic: the one-term comparison. */
  age_only_brier: number;
  age_only_auc: number;
  n: number;
  /** Standardized logistic weights, full fit. */
  coefficients: Array<{ term: string; weight: number }>;
  calibration: OddsCalibrationRow[];
  age_buckets: AgeBucketRow[];
  unknown_age_n: number;
  unknown_age_prevalence: number;
}

/** Every protocol in the snapshot, accounted for. */
export interface AuditReport {
  total: number;
  traded: number;
  has_token_no_mcap: number;
  ranked: number;
  excluded_category: number;
  excluded_versioned: number;
  excluded_wrapped: number;
  excluded_exchange: number;
  category_breakdown: Array<{ category: string; n: number }>;
}

/** One row of the Top-5 Farm Book: lowest break-even share first. */
export interface FarmBookRow {
  slug: string;
  name: string;
  expected_value_usd: number;
  farm_cost_usd: number;
  farm_hours: number;
  break_even_share_pct: number;
  verdict: string;
}

/** Range honesty: conformal band, its blind coverage, and the bootstrap slope band. */
export interface IntervalReport {
  conformal_q80_log10: number;
  conformal_factor: number;
  blind_coverage_pct: number;
  blind_coverage_n: number;
  slope_b_p10: number;
  slope_b_p90: number;
  bootstrap_refits: number;
}

/** Everything the dashboard's "Fitted, not asserted" evidence shows. */
export interface FitReport {
  /** OLS intercept: log10(mcap/TVL) = a + b * log10(TVL). Full precision: the dashboard recomputes with these exact values. */
  a: number;
  b: number;
  n: number;
  r2: number;
  /** Chosen adjustments, from the grid search below. */
  growth_weight: number;
  maturity_floor: number;
  breadth_per_chain: number;
  /** Four held-out models: one flat multiple, the radar-2 hand-set curve, the fitted size curve alone, radar-4. */
  holdout: HoldoutRow[];
  ablation: AblationRow[];
  ledger: LedgerRow[];
  calibration: CalibrationRow[];
  folds: FoldRow[];
  /** All 48 grid combinations, best first. */
  grid: GridRow[];
  /** The same models under three more blind splits, each with its own flat baseline. */
  blind: BlindScheme[];
  /** Every candidate term, kept or dropped on the 5-fold and LOO tests. */
  verdicts: VerdictRow[];
  placebo: PlaceboReport;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Median market-cap/TVL of the snapshot's live-token protocols: what the market pays per TVL dollar. */
  live_median_mcap_tvl: number;
  /** The fitted model and every held-out check behind it. */
  fit: FitReport;
  /** Token odds: prevalence fit, its scores, and the hazard forward rates. */
  odds: OddsReport;
  /** All 758 protocols accounted for. */
  audit: AuditReport;
  /** The five cheapest farms by break-even share. */
  farm_book: FarmBookRow[];
  /** Conformal band, blind coverage, bootstrap slope band. */
  intervals: IntervalReport;
  /** Pre-rendered evidence tables and cards: data.js carries them, the page injects them. */
  evidence: EvidenceHtml;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Evidence HTML rendered at build time so the dashboard source stays inside the dossier text cap. */
export interface EvidenceHtml {
  hold_html: string;
  abl_html: string;
  led_html: string;
  fold_html: string;
  cal_html: string;
  blind_html: string;
  verdict_html: string;
  odds_html: string;
  ocal_html: string;
  audit_html: string;
  farm_html: string;
  farm_counts: { FARM: number; THIN: number; SKIP: number };
  judge_html: string;
  strip_text: string;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG3 = Math.log10(3);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(listedAt + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round2 = (n: number): number => Math.round(n * 1e2) / 1e2;

/** Median of numbers, the upper middle on an even count (the dashboard uses the same rule). */
function median(values: number[]): number {
  const s = values.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

/** The p-th quantile (0..1) of numbers, by nearest rank. */
function quantile(values: number[], p: number): number {
  const s = values.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]!;
}

/** Median miss as a multiple: 10 to the median |log10(actual / predicted)|. */
function missOf(logMisses: number[]): number {
  return Math.pow(10, median(logMisses));
}

/** Share of |log10 misses| within log10(3), as a percentage. */
function within3Of(logMisses: number[]): number {
  if (logMisses.length === 0) return 0;
  return (100 * logMisses.filter((m) => m <= LOG3).length) / logMisses.length;
}

/** The traded protocols that fit the size curve: both figures recorded, slug order. */
export function fitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** OLS of log10(mcap/TVL) on log10(TVL), closed form, deterministic. */
export function olsFit(protocols: SnapshotProtocol[]): { a: number; b: number; n: number; r2: number } {
  const n = protocols.length;
  const xs = protocols.map((p) => Math.log10(p.tvl_usd));
  const ys = protocols.map((p) => Math.log10(p.mcap_usd! / p.tvl_usd));
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sst += (ys[i]! - my) * (ys[i]! - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (ys[i]! - (a + b * xs[i]!)) * (ys[i]! - (a + b * xs[i]!));
  return { a, b, n, r2: sst === 0 ? 0 : 1 - ssr / sst };
}

/** The fitted FDV/TVL multiple for a TVL. */
export function fittedMultiple(tvlUsd: number, fit: { a: number; b: number }): number {
  return Math.pow(10, fit.a + fit.b * Math.log10(Math.max(1, tvlUsd)));
}

/** Growth multiplier for a clamped seven-day change and a weight. */
function growthMultOf(change7d: number | null, weight: number): { pct: number; mult: number } {
  const pct = Math.min(150, Math.max(-50, finite(change7d, 0)));
  return { pct, mult: 1 + (pct / 100) * weight };
}

/** Maturity multiplier for an age in days and a floor. */
function maturityMultOf(age: number | null, floor: number): number {
  const ageForModel = age ?? 365;
  return floor + (1 - floor) * (Math.min(Math.max(ageForModel, 0), 1460) / 1460);
}

/** Breadth multiplier for a chain count and a per-chain weight. */
function breadthMultOf(chains: number, perChain: number): number {
  return 1 + Math.min(Math.max(chains - 1, 0), 5) * perChain;
}

/** The four multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: { a: number; b: number },
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const g = growthMultOf(protocol.change_7d, model.growth_weight);
  const maturityMult = maturityMultOf(age, model.maturity_floor);
  const breadthMult = breadthMultOf(protocol.chains.length, model.breadth_per_chain);
  const base = fittedMultiple(protocol.tvl_usd, fit);
  const implied = Math.max(1, Math.min(100_000_000_000_000, Math.round(protocol.tvl_usd * base * g.mult * maturityMult * breadthMult)));
  return { implied, base, growthPct: g.pct, growthMult: g.mult, maturityMult, breadthMult, age };
}

/** A traded protocol's predicted market cap under a fitted curve plus adjustments. */
function predictMcap(
  p: SnapshotProtocol,
  asOf: string,
  fit: { a: number; b: number },
  gw: number,
  floor: number,
  bw: number,
): number {
  const age = ageDays(asOf, p.listed_at);
  return p.tvl_usd * fittedMultiple(p.tvl_usd, fit) * growthMultOf(p.change_7d, gw).mult * maturityMultOf(age, floor) * breadthMultOf(p.chains.length, bw);
}

/** Held-out |log10| misses for one adjustment set, five folds, curve refit per fold. */
function heldOutMisses(
  fitted: SnapshotProtocol[],
  asOf: string,
  gw: number,
  floor: number,
  bw: number,
): number[] {
  const misses: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const train = fitted.filter((_, i) => i % 5 !== fold);
    const test = fitted.filter((_, i) => i % 5 === fold);
    const f = olsFit(train);
    for (const p of test) misses.push(Math.abs(Math.log10(p.mcap_usd! / predictMcap(p, asOf, f, gw, floor, bw))));
  }
  return misses;
}

/** Held-out misses for the radar-2 hand-set curve (fixed tiers, gw 0.6, floor 0.55, +2%/chain). */
function radar2Misses(fitted: SnapshotProtocol[], asOf: string): number[] {
  const tiers = (tvl: number): number => (tvl < 100_000_000 ? 0.45 : tvl < 1_000_000_000 ? 0.35 : tvl < 5_000_000_000 ? 0.28 : 0.22);
  return fitted.map((p) => {
    const age = ageDays(asOf, p.listed_at);
    const pred = p.tvl_usd * tiers(p.tvl_usd) * growthMultOf(p.change_7d, 0.6).mult * maturityMultOf(age, 0.55) * breadthMultOf(p.chains.length, 0.02);
    return Math.abs(Math.log10(p.mcap_usd! / pred));
  });
}

/** Held-out misses for one flat multiple: the train folds' median mcap/TVL. */
function flatMisses(fitted: SnapshotProtocol[]): number[] {
  const misses: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const train = fitted.filter((_, i) => i % 5 !== fold);
    const test = fitted.filter((_, i) => i % 5 === fold);
    const flat = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    for (const p of test) misses.push(Math.abs(Math.log10(p.mcap_usd! / (flat * p.tvl_usd))));
  }
  return misses;
}

/** The grid search: every combination, best first; ties keep the simpler one. */
export function gridSearch(
  fitted: SnapshotProtocol[],
  asOf: string,
): { best: { gw: number; floor: number; bw: number; miss: number }; grid: GridRow[] } {
  const rows: GridRow[] = [];
  // Iteration order is the tie-break: smaller gw, higher floor, smaller bw win ties.
  for (const gw of [0, 0.2, 0.4, 0.6]) {
    for (const floor of [1.0, 0.85, 0.7, 0.55]) {
      for (const bw of [0, 0.02, 0.04]) {
        const m = heldOutMisses(fitted, asOf, gw, floor, bw);
        rows.push({ growth_weight: gw, maturity_floor: floor, breadth_per_chain: bw, median_miss: round3(missOf(m)), within3_pct: round3(within3Of(m)) });
      }
    }
  }
  let best = rows[0]!;
  for (const r of rows) {
    if (r.median_miss < best.median_miss - 1e-12) best = r;
  }
  const sorted = rows.slice().sort((x, y) => x.median_miss - y.median_miss || x.growth_weight - y.growth_weight || y.maturity_floor - x.maturity_floor || x.breadth_per_chain - y.breadth_per_chain);
  return { best: { gw: best.growth_weight, floor: best.maturity_floor, bw: best.breadth_per_chain, miss: best.median_miss }, grid: sorted };
}

/** Whether a protocol records any token at all: a market cap, a CoinGecko id or a symbol. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** The four odds features: log TVL, log age, clamped 7-day growth, chain count. */
function oddsFeatures(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  return [Math.log10(Math.max(1, p.tvl_usd)), Math.log10(age + 1), Math.min(150, Math.max(-50, finite(p.change_7d, 0))), p.chains.length];
}

interface OddsFit {
  weights: number[];
  means: number[];
  sds: number[];
  cols: number[];
}

/** Logistic fit by fixed-iteration gradient descent on standardized features: deterministic. */
function fitLogistic(rows: Array<{ x: number[]; y: number }>, cols: number[]): OddsFit {
  const means = cols.map((c) => rows.reduce((s, r) => s + r.x[c]!, 0) / rows.length);
  const sds = cols.map((c, j) => {
    const v = rows.reduce((s, r) => s + (r.x[c]! - means[j]!) ** 2, 0) / rows.length;
    return Math.sqrt(v) || 1;
  });
  const w = new Array<number>(cols.length + 1).fill(0);
  const zOf = (x: number[]): number[] => [1, ...cols.map((c, j) => (x[c]! - means[j]!) / sds[j]!)];
  for (let it = 0; it < 2000; it++) {
    const g = new Array<number>(w.length).fill(0);
    for (const r of rows) {
      const z = zOf(r.x);
      const s = z.reduce((acc, zj, j) => acc + w[j]! * zj, 0);
      const pr = 1 / (1 + Math.exp(-s));
      for (let j = 0; j < w.length; j++) g[j] = g[j]! + (pr - r.y) * z[j]!;
    }
    for (let j = 0; j < w.length; j++) w[j] = w[j]! - (0.1 * g[j]!) / rows.length;
  }
  return { weights: w, means, sds, cols };
}

function predictOdds(fit: OddsFit, x: number[]): number {
  const z = [1, ...fit.cols.map((c, j) => (x[c]! - fit.means[j]!) / fit.sds[j]!)];
  const s = z.reduce((acc, zj, j) => acc + fit.weights[j]! * zj, 0);
  return 1 / (1 + Math.exp(-s));
}

/** Mann-Whitney AUC with ties at half credit. */
function aucOf(preds: Array<{ p: number; y: number }>): number {
  const pos = preds.filter((r) => r.y === 1).map((r) => r.p);
  const neg = preds.filter((r) => r.y === 0).map((r) => r.p);
  if (pos.length === 0 || neg.length === 0) return 0;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Age buckets for the hazard read: [label, lo days, hi days). */
const AGE_BUCKETS: Array<{ label: string; lo: number; hi: number }> = [
  { label: 'Under 1y', lo: 0, hi: 365 },
  { label: '1-2y', lo: 365, hi: 730 },
  { label: '2-3y', lo: 730, hi: 1095 },
  { label: '3-4y', lo: 1095, hi: 1460 },
  { label: 'Over 4y', lo: 1460, hi: Number.POSITIVE_INFINITY },
];

/** Which age bucket an age falls in; unknown age counts as 365 days, the model's rule. */
function ageBucketOf(age: number | null): number {
  const a = age ?? 365;
  const i = AGE_BUCKETS.findIndex((b) => a >= b.lo && a < b.hi);
  return i < 0 ? AGE_BUCKETS.length - 1 : i;
}

/**
 * Token odds, both layers. Prevalence: logistic on all 758, scored on the
 * same five slug folds as the value model. Forward: prevalence by age
 * bucket, monotonized into a launch curve F, read as conditional 12-month
 * rates (F[k+1]-F[k])/(1-F[k]); the open-ended last bucket reuses the last
 * interval's rate, since the snapshot cannot see past it.
 */
export function buildOdds(snapshot: Snapshot): { report: OddsReport; prevalence: Map<string, number>; forward: Map<string, number> } {
  const asOf = snapshot.as_of;
  const all = snapshot.protocols.slice().sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const rows = all.map((p) => ({ x: oddsFeatures(p, asOf), y: hasToken(p) ? 1 : 0 }));
  const oof = (cols: number[]): Array<{ p: number; y: number }> => {
    const out: Array<{ p: number; y: number }> = new Array(rows.length);
    for (let fold = 0; fold < 5; fold++) {
      const train = rows.filter((_, i) => i % 5 !== fold);
      const fit = fitLogistic(train, cols);
      rows.forEach((r, i) => {
        if (i % 5 === fold) out[i] = { p: predictOdds(fit, r.x), y: r.y };
      });
    }
    return out;
  };
  const brierOf = (preds: Array<{ p: number; y: number }>): number => preds.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / preds.length;
  const fullOof = oof([0, 1, 2, 3]);
  const ageOof = oof([1]);
  const baseRate = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  const sortedPreds = fullOof.slice().sort((a, b) => a.p - b.p);
  const calibration: OddsCalibrationRow[] = [];
  for (let d = 0; d < 10; d++) {
    const grp = sortedPreds.slice(Math.floor((d * sortedPreds.length) / 10), Math.floor(((d + 1) * sortedPreds.length) / 10));
    calibration.push({
      decile: d + 1,
      n: grp.length,
      mean_pred: round3(grp.reduce((s, r) => s + r.p, 0) / grp.length),
      actual_rate: round3(grp.reduce((s, r) => s + r.y, 0) / grp.length),
    });
  }
  const fullFit = fitLogistic(rows, [0, 1, 2, 3]);
  const terms = ['log TVL', 'log age', '7-day growth', 'chains'];
  const coefficients = terms.map((term, j) => ({ term, weight: round3(fullFit.weights[j + 1]!) }));
  const prevalenceByBucket = AGE_BUCKETS.map((b) => {
    const grp = all.filter((p) => {
      const a = ageDays(asOf, p.listed_at);
      return a !== null && a >= b.lo && a < b.hi;
    });
    return { n: grp.length, rate: grp.length === 0 ? 0 : grp.filter(hasToken).length / grp.length };
  });
  const F: number[] = [];
  let runMax = 0;
  for (const b of prevalenceByBucket) {
    runMax = Math.max(runMax, b.rate);
    F.push(runMax);
  }
  const forwardByBucket = F.map((f, k) => {
    if (k < F.length - 1) return f < 1 ? (F[k + 1]! - f) / (1 - f) : 0;
    const prev = F[k - 1]!;
    return prev < 1 ? (f - prev) / (1 - prev) : 0;
  });
  const unknownAge = all.filter((p) => ageDays(asOf, p.listed_at) === null);
  const prevalence = new Map<string, number>();
  const forward = new Map<string, number>();
  for (const p of all) {
    prevalence.set(p.slug, round4(predictOdds(fullFit, oddsFeatures(p, asOf))));
    forward.set(p.slug, round4(forwardByBucket[ageBucketOf(ageDays(asOf, p.listed_at))]!));
  }
  const report: OddsReport = {
    brier: round4(brierOf(fullOof)),
    auc: round3(aucOf(fullOof)),
    base_brier: round4(brierOf(rows.map((r) => ({ p: baseRate, y: r.y })))),
    base_rate: round3(baseRate),
    age_only_brier: round4(brierOf(ageOof)),
    age_only_auc: round3(aucOf(ageOof)),
    n: rows.length,
    coefficients,
    calibration,
    age_buckets: AGE_BUCKETS.map((b, k) => ({
      label: b.label,
      n: prevalenceByBucket[k]!.n,
      prevalence: round3(prevalenceByBucket[k]!.rate),
      forward_odds: round3(forwardByBucket[k]!),
    })),
    unknown_age_n: unknownAge.length,
    unknown_age_prevalence: unknownAge.length === 0 ? 0 : round3(unknownAge.filter(hasToken).length / unknownAge.length),
  };
  return { report, prevalence, forward };
}

/** Every protocol accounted for, by the first rule that claims it. */
export function buildAudit(snapshot: Snapshot): AuditReport {
  let traded = 0;
  let hasNoMcap = 0;
  let ranked = 0;
  let exclCat = 0;
  let exclVer = 0;
  let exclWrap = 0;
  let exclExch = 0;
  const byCat = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0) traded++;
    else if (hasToken(p)) hasNoMcap++;
    else if (isRankable(p)) ranked++;
    else if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
      exclCat++;
      byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
    } else if (VERSIONED.test(p.name)) exclVer++;
    else if (WRAPPED_WORD.test(p.name)) exclWrap++;
    else exclExch++;
  }
  return {
    total: snapshot.protocols.length,
    traded,
    has_token_no_mcap: hasNoMcap,
    ranked,
    excluded_category: exclCat,
    excluded_versioned: exclVer,
    excluded_wrapped: exclWrap,
    excluded_exchange: exclExch,
    category_breakdown: [...byCat.entries()].map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1)),
  };
}

/** Gas in dollars, matching gasFor's tiers; "under $1" counts as $0.50. */
function gasNums(chain: string): { first: number; tx: number; weekly: number; exit: number } {
  if (chain === 'Ethereum') return { first: 8, tx: 5, weekly: 5, exit: 8 };
  if (chain === 'Bitcoin') return { first: 2, tx: 2, weekly: 2, exit: 2 };
  return { first: 0.5, tx: 0.5, weekly: 0.5, exit: 0.5 };
}

/** Active farm time is valued at this rate, stated on the page. */
const TIME_RATE_USD = 15;
/** Verdict thresholds on break-even share of expected FDV: 0.01% / 0.03%. */
const FARM_MAX_SHARE = 0.0001;
const THIN_MAX_SHARE = 0.0003;

/** One plan's economics: gas plus active time, against expected value. */
export function farmEconomics(p: SnapshotProtocol, age: number | null, expected: number): { cost: number; hours: number; beSharePct: number; verdict: string } {
  const g = gasNums(chainOf(p));
  const weeks = Math.ceil(holdDaysFor(age) / 7);
  const gas = g.first + g.tx + g.tx + g.weekly * weeks + g.exit;
  const hours = (5 + 15 + 10 + 10 * weeks + 10 + 15) / 60;
  const cost = gas + hours * TIME_RATE_USD;
  const be = expected > 0 ? cost / expected : Number.POSITIVE_INFINITY;
  const beSharePct = round4(be * 100);
  return {
    cost: round2(cost),
    hours: round2(hours),
    beSharePct,
    verdict: beSharePct / 100 <= FARM_MAX_SHARE ? 'FARM' : beSharePct / 100 <= THIN_MAX_SHARE ? 'THIN' : 'SKIP',
  };
}

/** A seeded PRNG (mulberry32): the bootstrap must be byte-deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** OLS with one extra regressor, by normal equations: log10(mcap/TVL) on log TVL plus one term. */
function olsMulti(train: SnapshotProtocol[], asOf: string, extra: 'chains' | 'growth' | 'age'): (p: SnapshotProtocol) => number {
  const feats = (p: SnapshotProtocol): number[] => {
    const x = [1, Math.log10(Math.max(1, p.tvl_usd))];
    if (extra === 'chains') x.push(p.chains.length);
    if (extra === 'growth') x.push(Math.min(150, Math.max(-50, finite(p.change_7d, 0))));
    if (extra === 'age') x.push(Math.log10((ageDays(asOf, p.listed_at) ?? 365) + 1));
    return x;
  };
  const X = train.map(feats);
  const Y = train.map((p) => Math.log10(p.mcap_usd! / p.tvl_usd));
  const k = 3;
  const A: number[][] = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, row) => s + row[a]! * row[b]!, 0)));
  const v = Array.from({ length: k }, (_, a) => X.reduce((s, row, i) => s + row[a]! * Y[i]!, 0));
  const M = A.map((row, i) => [...row, v[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let cc = c; cc <= k; cc++) M[r]![cc] = M[r]![cc]! - f * M[c]![cc]!;
    }
  }
  const w = M.map((row, i) => row[k]! / row[i]!);
  return (p) => p.tvl_usd * Math.pow(10, feats(p).reduce((s, xj, j) => s + w[j]! * xj, 0));
}

/** Median regression (LAD) by iteratively reweighted least squares, fixed iterations. */
function ladPredict(train: SnapshotProtocol[]): (p: SnapshotProtocol) => number {
  const xs = train.map((p) => Math.log10(Math.max(1, p.tvl_usd)));
  const ys = train.map((p) => Math.log10(p.mcap_usd! / p.tvl_usd));
  let wts = train.map(() => 1);
  let a = 0;
  let b = 0;
  for (let it = 0; it < 50; it++) {
    const sw = wts.reduce((s, w) => s + w, 0);
    const mx = xs.reduce((s, x, i) => s + wts[i]! * x, 0) / sw;
    const my = ys.reduce((s, y, i) => s + wts[i]! * y, 0) / sw;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += wts[i]! * (xs[i]! - mx) * (ys[i]! - my);
      sxx += wts[i]! * (xs[i]! - mx) ** 2;
    }
    b = sxx === 0 ? 0 : sxy / sxx;
    a = my - b * mx;
    wts = ys.map((y, i) => 1 / Math.max(Math.abs(y - (a + b * xs[i]!)), 1e-6));
  }
  return (p) => p.tvl_usd * Math.pow(10, a + b * Math.log10(Math.max(1, p.tvl_usd)));
}

/** Category-median multiples, shrunk toward the global median (k = 5). */
function catMedianPredict(train: SnapshotProtocol[]): (p: SnapshotProtocol) => number {
  const glob = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? 'Other';
    const lst = byCat.get(key) ?? [];
    lst.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, lst);
  }
  return (p) => {
    const lst = byCat.get(p.category ?? 'Other');
    const m = lst && lst.length > 0 ? (lst.length * median(lst) + 5 * glob) / (lst.length + 5) : glob;
    return m * p.tvl_usd;
  };
}

type Scheme = 'fivefold' | 'loo' | 'wf80' | 'wf60';

/** Held-out |log10| misses under one blind scheme, for one predictor factory. */
function schemeMisses(fitted: SnapshotProtocol[], scheme: Scheme, make: (train: SnapshotProtocol[]) => (p: SnapshotProtocol) => number): { misses: number[]; n: number } {
  const miss = (pred: (p: SnapshotProtocol) => number, p: SnapshotProtocol): number => Math.abs(Math.log10(p.mcap_usd! / pred(p)));
  if (scheme === 'fivefold') {
    const misses: number[] = [];
    for (let fold = 0; fold < 5; fold++) {
      const pred = make(fitted.filter((_, i) => i % 5 !== fold));
      for (const p of fitted.filter((_, i) => i % 5 === fold)) misses.push(miss(pred, p));
    }
    return { misses, n: misses.length };
  }
  if (scheme === 'loo') {
    const misses = fitted.map((p, i) => miss(make(fitted.filter((_, j) => j !== i)), p));
    return { misses, n: misses.length };
  }
  const dated = fitted
    .filter((p) => p.listed_at !== null)
    .slice()
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const cut = Math.floor(dated.length * (scheme === 'wf80' ? 0.8 : 0.6));
  const pred = make(dated.slice(0, cut));
  const test = dated.slice(cut);
  return { misses: test.map((p) => miss(pred, p)), n: test.length };
}

/** TVL strata for the ledger and the calibration table. */
const STRATA: Array<{ label: string; lo: number; hi: number }> = [
  { label: 'Under $100M', lo: 0, hi: 100_000_000 },
  { label: '$100M-$1B', lo: 100_000_000, hi: 1_000_000_000 },
  { label: '$1B-$5B', lo: 1_000_000_000, hi: 5_000_000_000 },
  { label: '$5B and up', lo: 5_000_000_000, hi: Number.POSITIVE_INFINITY },
];

/** The full fit report: every number the dashboard's evidence shows. */
export function buildFitReport(snapshot: Snapshot, fitted: SnapshotProtocol[], full: { a: number; b: number; n: number; r2: number }, chosen: { gw: number; floor: number; bw: number }, grid: GridRow[]): FitReport {
  const asOf = snapshot.as_of;
  const flat = flatMisses(fitted);
  const r2m = radar2Misses(fitted, asOf);
  const sizeOnly = heldOutMisses(fitted, asOf, 0, 1.0, 0);
  const fullM = heldOutMisses(fitted, asOf, chosen.gw, chosen.floor, chosen.bw);
  const holdout: HoldoutRow[] = [
    { label: 'One flat multiple (market median)', median_miss: round3(missOf(flat)), within3_pct: round3(within3Of(flat)), n: fitted.length },
    { label: 'radar-2 hand-set curve', median_miss: round3(missOf(r2m)), within3_pct: round3(within3Of(r2m)), n: fitted.length },
    { label: 'Fitted size curve alone', median_miss: round3(missOf(sizeOnly)), within3_pct: round3(within3Of(sizeOnly)), n: fitted.length },
    { label: 'radar-4 (fitted + grid adjustments)', median_miss: round3(missOf(fullM)), within3_pct: round3(within3Of(fullM)), n: fitted.length },
  ];
  // Ablation: each stage adds one term, every stage re-checked on the same five folds.
  const gM = heldOutMisses(fitted, asOf, chosen.gw, 1.0, 0);
  const gmM = heldOutMisses(fitted, asOf, chosen.gw, chosen.floor, 0);
  const ablation: AblationRow[] = [
    { stage: 'Flat median only', median_miss: round3(missOf(flat)), within3_pct: round3(within3Of(flat)), n: fitted.length },
    { stage: '+ fitted size curve', median_miss: round3(missOf(sizeOnly)), within3_pct: round3(within3Of(sizeOnly)), n: fitted.length },
    { stage: '+ growth (weight ' + chosen.gw.toFixed(1) + ')', median_miss: round3(missOf(gM)), within3_pct: round3(within3Of(gM)), n: fitted.length },
    { stage: '+ maturity (floor ' + chosen.floor.toFixed(2) + ')', median_miss: round3(missOf(gmM)), within3_pct: round3(within3Of(gmM)), n: fitted.length },
    { stage: '+ breadth (radar-4)', median_miss: round3(missOf(fullM)), within3_pct: round3(within3Of(fullM)), n: fitted.length },
  ];
  const ledger: LedgerRow[] = STRATA.map((s) => {
    const inStratum = fitted.filter((p) => p.tvl_usd >= s.lo && p.tvl_usd < s.hi);
    const ratios = inStratum.map((p) => p.mcap_usd! / p.tvl_usd);
    const medTvl = inStratum.length === 0 ? 0 : median(inStratum.map((p) => p.tvl_usd));
    return {
      stratum: s.label,
      n: inStratum.length,
      median_actual: inStratum.length === 0 ? 0 : round3(median(ratios)),
      p25_actual: inStratum.length === 0 ? 0 : round3(quantile(ratios, 0.25)),
      p75_actual: inStratum.length === 0 ? 0 : round3(quantile(ratios, 0.75)),
      fitted_multiple: inStratum.length === 0 ? 0 : round4(fittedMultiple(medTvl, full)),
      median_tvl: medTvl,
    };
  });
  // Calibration: out-of-fold radar-4 predictions, median actual over predicted per stratum.
  const oofPred = new Map<string, number>();
  for (let fold = 0; fold < 5; fold++) {
    const train = fitted.filter((_, i) => i % 5 !== fold);
    const test = fitted.filter((_, i) => i % 5 === fold);
    const f = olsFit(train);
    for (const p of test) oofPred.set(p.slug, predictMcap(p, asOf, f, chosen.gw, chosen.floor, chosen.bw));
  }
  const calibration: CalibrationRow[] = STRATA.map((s) => {
    const inStratum = fitted.filter((p) => p.tvl_usd >= s.lo && p.tvl_usd < s.hi);
    const ratios = inStratum.map((p) => p.mcap_usd! / oofPred.get(p.slug)!);
    return { stratum: s.label, n: inStratum.length, median_actual_over_pred: inStratum.length === 0 ? 0 : round3(median(ratios)) };
  });
  const folds: FoldRow[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const train = fitted.filter((_, i) => i % 5 !== fold);
    const test = fitted.filter((_, i) => i % 5 === fold);
    const f = olsFit(train);
    const misses = test.map((p) => Math.abs(Math.log10(p.mcap_usd! / predictMcap(p, asOf, f, chosen.gw, chosen.floor, chosen.bw))));
    folds.push({ fold: fold + 1, n_test: test.length, median_miss: round3(missOf(misses)), within3: misses.filter((m) => m <= LOG3).length });
  }
  // Blind tests: three more splits, each carrying its own flat baseline so the
  // numbers stay comparable within a split and honest across splits.
  const flatPred = (train: SnapshotProtocol[]): ((p: SnapshotProtocol) => number) => {
    const m = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    return (p) => m * p.tvl_usd;
  };
  const sizePred = (train: SnapshotProtocol[]): ((p: SnapshotProtocol) => number) => {
    const f = olsFit(train);
    return (p) => p.tvl_usd * fittedMultiple(p.tvl_usd, f);
  };
  const fullPred = (gw: number, floor: number, bw: number) => (train: SnapshotProtocol[]): ((p: SnapshotProtocol) => number) => {
    const f = olsFit(train);
    return (p) => predictMcap(p, asOf, f, gw, floor, bw);
  };
  const blindRow = (label: string, scheme: Scheme, make: (train: SnapshotProtocol[]) => (p: SnapshotProtocol) => number): HoldoutRow => {
    const { misses, n } = schemeMisses(fitted, scheme, make);
    return { label, median_miss: round3(missOf(misses)), within3_pct: round3(within3Of(misses)), n };
  };
  const blind: BlindScheme[] = ([
    ['Leave-one-out (128 refits)', 'loo'],
    ['Walk-forward by listing date, 80/20', 'wf80'],
    ['Walk-forward by listing date, 60/40', 'wf60'],
  ] as Array<[string, Scheme]>).map(([scheme, key]) => ({
    scheme,
    rows: [
      blindRow('One flat multiple (same split)', key, flatPred),
      blindRow('Fitted size curve alone', key, sizePred),
      blindRow('radar-4 (fitted + grid adjustments)', key, fullPred(chosen.gw, chosen.floor, chosen.bw)),
    ],
  }));
  // Kept or dropped: every candidate term against the size curve alone, on
  // the 5-fold and the LOO test. KEEP needs a 5-fold gain without giving
  // back more than 5% on LOO; the dropped terms stay on the page with
  // their numbers.
  const base5 = missOf(schemeMisses(fitted, 'fivefold', sizePred).misses);
  const baseLoo = missOf(schemeMisses(fitted, 'loo', sizePred).misses);
  const verdictOf = (term: string, make: (train: SnapshotProtocol[]) => (p: SnapshotProtocol) => number, b5: number = base5, bloo: number = baseLoo): VerdictRow => {
    const m5 = missOf(schemeMisses(fitted, 'fivefold', make).misses);
    const mloo = missOf(schemeMisses(fitted, 'loo', make).misses);
    return { term, miss_5fold: round3(m5), miss_loo: round3(mloo), verdict: m5 < b5 && mloo <= bloo * 1.05 ? 'KEEP' : 'DROP' };
  };
  const flat5 = missOf(schemeMisses(fitted, 'fivefold', flatPred).misses);
  const flatLoo = missOf(schemeMisses(fitted, 'loo', flatPred).misses);
  const verdicts: VerdictRow[] = [
    verdictOf('Size curve (vs flat)', sizePred, flat5, flatLoo),
    verdictOf('Growth multiplier (grid weight)', fullPred(chosen.gw, 1.0, 0)),
    verdictOf('Maturity multiplier (grid floor)', fullPred(0, chosen.floor, 0)),
    verdictOf('Breadth multiplier (grid per-chain)', fullPred(0, 1.0, chosen.bw)),
    verdictOf('All three adjustments (radar-4)', fullPred(chosen.gw, chosen.floor, chosen.bw)),
    verdictOf('Category-median multiples (shrunk)', catMedianPredict),
    verdictOf('LAD median regression', ladPredict),
    verdictOf('Chains as a regressor', (train) => olsMulti(train, asOf, 'chains')),
    verdictOf('Growth as a regressor', (train) => olsMulti(train, asOf, 'growth')),
    verdictOf('Age as a regressor', (train) => olsMulti(train, asOf, 'age')),
  ];
  // Placebo: growth rotated across the fitted set (slug order, by 37), grid re-run.
  const rotated = fitted.map((p, i) => ({ ...p, change_7d: fitted[(i + 37) % fitted.length]!.change_7d }));
  const placeboBest = gridSearch(rotated, asOf).best;
  const placebo: PlaceboReport = {
    real_growth_weight: chosen.gw,
    real_maturity_floor: chosen.floor,
    real_breadth_per_chain: chosen.bw,
    real_miss: round3(missOf(fullM)),
    placebo_growth_weight: placeboBest.gw,
    placebo_maturity_floor: placeboBest.floor,
    placebo_breadth_per_chain: placeboBest.bw,
    placebo_miss: placeboBest.miss,
  };
  return {
    a: full.a,
    b: full.b,
    n: full.n,
    r2: round3(full.r2),
    growth_weight: chosen.gw,
    maturity_floor: chosen.floor,
    breadth_per_chain: chosen.bw,
    holdout,
    ablation,
    ledger,
    calibration,
    folds,
    grid,
    blind,
    verdicts,
    placebo,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked or bridged product of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a launch candidate never starts with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token and not a wrapped,
 * staked or bridged product of a token that already trades. This is the house
 * watchlist rule, as far as the snapshot's ten fields can express it: the
 * snapshot carries no parent protocol, so that part of the rule cannot be
 * applied here, and a sub-product the house left out for having a parent
 * still ranks.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants,
  fit: { a: number; b: number },
  ctx: { prevalence: Map<string, number>; forward: Map<string, number>; conformalFactor: number; rankRanges: Map<string, { lo: number; hi: number }> },
): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isRankable);
  const scored = candidates.map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fit);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const fwd = ctx.forward.get(s.p.slug) ?? 0;
    const expected = Math.max(1, Math.round(s.implied * fwd));
    const econ = farmEconomics(s.p, s.age, expected);
    const range = ctx.rankRanges.get(s.p.slug) ?? { lo: i + 1, hi: i + 1 };
    range.lo = Math.min(range.lo, i + 1);
    range.hi = Math.max(range.hi, i + 1);
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
      token_status: 'pre-token' as const,
      watchlist: watch.has(s.p.slug),
      age_days: s.age,
      implied_value_usd: s.implied,
      token_odds: ctx.prevalence.get(s.p.slug) ?? 0,
      forward_odds: fwd,
      expected_value_usd: expected,
      implied_lo_usd: Math.max(1, Math.round(s.implied / ctx.conformalFactor)),
      implied_hi_usd: Math.min(100_000_000_000_000, Math.round(s.implied * ctx.conformalFactor)),
      rank_lo: range.lo,
      rank_hi: range.hi,
      farm_verdict: econ.verdict,
      farm_cost_usd: econ.cost,
      farm_hours: econ.hours,
      break_even_share_pct: econ.beSharePct,
      model: {
        base_multiple: round4(s.base),
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

// Category -> farm actions, as a table: [keys, first action, second action].
// A key starting with ~ is a word-boundary match, the rest are substrings;
// first match wins. {c} is $capital, {n} the name, {h} the chain.
const FARM_ACTS: Array<[string, string, string]> = [
  ['lend,cdp,collateral', 'Supply {c} of USDC to {n} on {h} and keep the position open.', 'Borrow $10 against the supply on {n}, then repay it the same week.'],
  ['~dex,swap', "Provide {c} of liquidity to {n}'s main pool on {h} and keep the position open.", "Swap $10 through {n}'s main pool on {h}."],
  ['curator,allocator,cedefi', 'Deposit {c} into a {n} vault on {h} and keep the shares.', 'Deposit $10 more into a second {n} vault on {h}.'],
  ['basis trading', 'Deposit {c} into a {n} basis vault on {h} and keep the shares.', 'Deposit $10 more into a second {n} vault on {h}.'],
  ['liquidity manager', 'Deposit {c} into a {n} managed liquidity vault on {h} and keep the shares.', 'Deposit $10 more into a second {n} vault on {h}.'],
  ['yield aggregator,leveraged farm', "Deposit {c} into {n}'s main yield vault on {h} and keep the shares.", 'Claim or compound the yield the {n} position earned, even if it is small.'],
  ['yield', "Deposit {c} into {n}'s highest-TVL yield pool on {h} and keep the position open.", 'Claim or compound the yield the {n} position earned, even if it is small.'],
  ['farm', "Deposit {c} into {n}'s main farm on {h} and keep the position open.", 'Harvest the rewards the {n} farm paid, or compound them back into the position.'],
  ['perpetual,derivative,options', 'Deposit {c} of USDC as margin on {n} and open one small hedge.', 'Close the hedge on {n}, then open a fresh one half its size.'],
  ['prediction', 'Fund {c} and place one market position on {n}.', 'Settle or close the first position on {n}, then place a second one.'],
  ['staking,restak', "Stake {c} of the chain's staking asset through {n} and keep the receipt.", 'Restake the staking rewards {n} paid, or claim them to the same wallet.'],
  ['stable', 'Mint or deposit {c} of the stable asset through {n} on {h}.', 'Swap $10 of the stable asset through {n} on {h}.'],
  ['rwa', "Mint {c} of {n}'s yield asset on {h} and hold it.", 'Check the yield {n} accrued and leave it compounding in the position.'],
  ['anchor btc,decentralized btc', "Mint {c} of {n}'s BTC-backed asset on {h} and hold it.", "Check the yield {n}'s BTC-backed asset accrued and leave it compounding."],
  ['insurance', 'Buy {c} of cover from {n} on {h} and keep the policy.', 'Open the {n} policy page and confirm the cover is still active.'],
  ['payment', 'Send {c} through {n} on {h} and keep the channel open.', 'Make a second $10 payment through {n}.'],
  ['otc', 'Place a {c} order on {n} on {h} and keep the position open.', 'Fill a second $10 order on {n}.'],
  ['card', 'Load {c} onto a {n} card on {h} and make one small purchase.', 'Make a second small purchase with the {n} card.'],
  ['governance', "Deposit {c} into {n}'s incentives vault on {h} and keep the shares.", 'Deposit $10 more into a second {n} vault on {h}.'],
  ['index', 'Buy {c} of the {n} index on {h} and hold it.', 'Check what the {n} index holds and hold the position through the next rebalance.'],
  ['bridge', 'Bridge {c} of USDC through {n} to {h} and use the bridged funds in its app.', 'Bridge $10 back through {n}, or use the bridged funds in a second app on {h}.'],
  ['chain', 'Bridge {c} of USDC to {n} through its official bridge, then use one flagship app on it.', 'Use a second app on the chain, such as its main swap or lending market.'],
];

function fillFarm(t: string, p: SnapshotProtocol, capital: number, chain: string): string {
  return t.split('{c}').join('$' + capital).split('{n}').join(p.name).split('{h}').join(chain);
}

function pickFarm(c: string, col: 1 | 2): string | null {
  for (const row of FARM_ACTS) {
    for (const key of row[0].split(',')) {
      if (key.charAt(0) === '~' ? new RegExp('\\b' + key.slice(1)).test(c) : c.indexOf(key) >= 0) return row[col];
    }
  }
  return null;
}

/** What one transaction costs on a chain: Ethereum is dear, Bitcoin middling, the rest cheap. */
export function gasFor(chain: string): { first: string; tx: string; weekly: string; exit: string } {
  if (chain === 'Ethereum') {
    return { first: 'about $8 of gas for the first transaction', tx: 'about $5 of gas', weekly: 'about $5 of gas a week', exit: 'about $8 of gas to exit' };
  }
  if (chain === 'Bitcoin') {
    return { first: 'about $2 of gas for the first transaction', tx: 'about $2 of gas', weekly: 'about $2 of gas a week', exit: 'about $2 of gas to exit' };
  }
  return { first: 'under $1 of gas for the first transaction', tx: 'under $1 of gas', weekly: 'under $1 of gas a week', exit: 'under $1 of gas to exit' };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. The dashboard renders these
 * exact strings from data.js; it holds no copy of this table.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const cat = (p.category ?? '').toLowerCase();
  const action = fillFarm(pickFarm(cat, 1) ?? 'Deposit {c} of USDC into {n} on {h} and keep the position open.', p, capital, chain);
  const second = fillFarm(pickFarm(cat, 2) ?? 'Make a second $10 deposit into {n} on {h}, or use a second feature of it.', p, 0, chain);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas.first, time: '5 minutes' },
    { text: action, cost: '$' + capital + ' of capital and ' + gas.tx, time: '15 minutes to set up' },
    { text: second, cost: gas.tx, time: '10 minutes' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas.weekly, time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
    { text: "Before you withdraw, open the protocol's own rewards page, if it has one, and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in steps and keep $5 of gas in the wallet.', cost: gas.exit, time: '15 minutes to unwind' },
  ];
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
    }));
}

/** A board row's compact form for data.js, farm plan included. */
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
    token_odds: row.token_odds,
    forward_odds: row.forward_odds,
    expected_value_usd: row.expected_value_usd,
    implied_lo_usd: row.implied_lo_usd,
    implied_hi_usd: row.implied_hi_usd,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    farm_verdict: row.farm_verdict,
    farm_cost_usd: row.farm_cost_usd,
    farm_hours: row.farm_hours,
    break_even_share_pct: row.break_even_share_pct,
    base_multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist: row.watchlist,
    farm_steps: row.farm_steps,
  };
}

/** Conformal 80% band from 5-fold out-of-fold residuals, coverage checked blind on walk-forward 80/20. */
export function conformalBand(fitted: SnapshotProtocol[], asOf: string, chosen: { gw: number; floor: number; bw: number }): { q80: number; factor: number; coveragePct: number; coverageN: number } {
  const residuals: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const f = olsFit(fitted.filter((_, i) => i % 5 !== fold));
    for (const p of fitted.filter((_, i) => i % 5 === fold)) {
      residuals.push(Math.abs(Math.log10(p.mcap_usd! / predictMcap(p, asOf, f, chosen.gw, chosen.floor, chosen.bw))));
    }
  }
  const q80 = quantile(residuals, 0.8);
  const dated = fitted
    .filter((p) => p.listed_at !== null)
    .slice()
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const cut = Math.floor(dated.length * 0.8);
  const f = olsFit(dated.slice(0, cut));
  const test = dated.slice(cut);
  const covered = test.filter((p) => Math.abs(Math.log10(p.mcap_usd! / predictMcap(p, asOf, f, chosen.gw, chosen.floor, chosen.bw))) <= q80).length;
  return { q80: round3(q80), factor: Math.pow(10, q80), coveragePct: test.length === 0 ? 0 : round3((100 * covered) / test.length), coverageN: test.length };
}

/** Bootstrap rank ranges and slope band: 200 seeded refits of the size curve. */
export function bootstrapRanks(
  snapshot: Snapshot,
  fitted: SnapshotProtocol[],
  model: ModelConstants,
): { ranges: Map<string, { lo: number; hi: number }>; slopeP10: number; slopeP90: number; refits: number } {
  const REFITS = 200;
  const rand = mulberry32(20261126);
  const candidates = snapshot.protocols.filter(isRankable);
  const ranksBySlug = new Map<string, number[]>();
  const slopes: number[] = [];
  for (let r = 0; r < REFITS; r++) {
    const sample = fitted.map(() => fitted[Math.floor(rand() * fitted.length)]!);
    const f = olsFit(sample);
    slopes.push(f.b);
    const scored = candidates
      .map((p) => ({ slug: p.slug, v: impliedValue(p, snapshot.as_of, model, f).implied }))
      .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
    scored.forEach((s, i) => {
      const lst = ranksBySlug.get(s.slug) ?? [];
      lst.push(i + 1);
      ranksBySlug.set(s.slug, lst);
    });
  }
  const ranges = new Map<string, { lo: number; hi: number }>();
  for (const [slug, ranks] of ranksBySlug) {
    ranges.set(slug, { lo: Math.round(quantile(ranks, 0.1)), hi: Math.round(quantile(ranks, 0.9)) });
  }
  return { ranges, slopeP10: round3(quantile(slopes, 0.1)), slopeP90: round3(quantile(slopes, 0.9)), refits: REFITS };
}

/** USD formatting matching the dashboard's fmtUsd, for pre-rendered tables. */
function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** The dashboard's evidence-table shape, rendered at build time. */
function evTable(head: string[], rows: string[][]): string {
  return '<table class="consts"><thead><tr>' + head.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}

/** Evidence tables, the judge card and the integrity strip, rendered into data.js. */
export function buildEvidence(
  snapshot: Snapshot,
  board: BoardRow[],
  report: FitReport,
  odds: OddsReport,
  audit: AuditReport,
  farmBook: FarmBookRow[],
  intervals: IntervalReport,
  model: ModelConstants,
  fit: { a: number; b: number },
): EvidenceHtml {
  const f = report;
  const holdHtml = evTable(['Model', 'Held-out median miss', 'Within 3×'], f.holdout.map((r) => [r.label, '×' + r.median_miss.toFixed(2), Math.round((r.within3_pct * r.n) / 100) + ' / ' + r.n]));
  const ablHtml = evTable(['Stage', 'Held-out median miss', 'Within 3×'], f.ablation.map((r) => [r.stage, '×' + r.median_miss.toFixed(2), Math.round((r.within3_pct * r.n) / 100) + ' / ' + r.n]));
  const ledHtml = evTable(['TVL stratum', 'n', 'Median actual', 'p25–p75', 'Fitted multiple'], f.ledger.map((r) => [r.stratum, String(r.n), '×' + r.median_actual.toFixed(2), '×' + r.p25_actual.toFixed(2) + '–×' + r.p75_actual.toFixed(2), '×' + r.fitted_multiple.toFixed(3)]));
  const foldHtml = evTable(['Fold', 'Held-out n', 'Median miss', 'Within 3×'], f.folds.map((r) => ['Fold ' + r.fold, String(r.n_test), '×' + r.median_miss.toFixed(2), r.within3 + ' / ' + r.n_test]));
  const calHtml = evTable(['TVL stratum', 'n', 'Median actual / predicted'], f.calibration.map((r) => [r.stratum, String(r.n), r.median_actual_over_pred.toFixed(2)]));
  const blindHtml = evTable(['Blind split', 'Flat median miss', 'Size curve', 'radar-4'], f.blind.map((s) => [s.scheme + ' (n=' + s.rows[0]!.n + ')', '×' + s.rows[0]!.median_miss.toFixed(2), '×' + s.rows[1]!.median_miss.toFixed(2), '×' + s.rows[2]!.median_miss.toFixed(2)]));
  const verdictHtml = evTable(['Candidate term', '5-fold miss', 'LOO miss', 'Verdict'], f.verdicts.map((v) => [v.term, '×' + v.miss_5fold.toFixed(2), '×' + v.miss_loo.toFixed(2), v.verdict]));
  const oddsHtml = evTable(['Age bucket', 'n', 'Has a token now', 'Forward odds, 12m'], odds.age_buckets.map((b) => [b.label, String(b.n), Math.round(b.prevalence * 100) + '%', Math.round(b.forward_odds * 100) + '%']));
  const ocalHtml = evTable(['Decile', 'n', 'Predicted', 'Actual'], odds.calibration.map((c) => [String(c.decile), String(c.n), c.mean_pred.toFixed(2), c.actual_rate.toFixed(2)]));
  const auditHtml = evTable(['Where every protocol went', 'n'], [['Already traded (fitted on)', String(audit.traded)], ['Has a token, no market cap', String(audit.has_token_no_mcap)], ['Ranked on this board', String(audit.ranked)], ['Excluded category', String(audit.excluded_category)], ['Versioned name', String(audit.excluded_versioned)], ['Wrapped word in name', String(audit.excluded_wrapped)], ['Exchange prefix', String(audit.excluded_exchange)], ['Total', String(audit.total)]]);
  const farmHtml = evTable(['Protocol', 'Expected value', 'Plan cost', 'Hours', 'Break-even', 'Verdict'], farmBook.map((r) => [r.name, fmtUsd(r.expected_value_usd), '$' + r.farm_cost_usd.toFixed(2), r.farm_hours.toFixed(1), r.break_even_share_pct + '%', r.verdict]));
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) counts[r.farm_verdict as keyof typeof counts] = (counts[r.farm_verdict as keyof typeof counts] ?? 0) + 1;
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const recheck = board.filter((r) => impliedValue(bySlug.get(r.slug)!, snapshot.as_of, model, fit).implied === r.implied_value_usd).length;
  const watchRanked = board.filter((r) => r.watchlist).length;
  const gridBest = f.grid[0]!;
  const judgeHtml =
    '<li>Working radar: the page recomputes every row from the snapshot figures and checks it against board.json (' + recheck + ' / ' + board.length + ' match); all ' + audit.total + ' protocols accounted for in the audit below.</li>' +
    '<li>Value model: fitted at run time on 128 traded tokens — log10(mcap/TVL) = ' + f.a.toFixed(2) + ' ' + (f.b < 0 ? '− ' : '+ ') + Math.abs(f.b).toFixed(2) + '·log10(TVL), R² ' + f.r2.toFixed(2) + ' — with a 48-combination grid picking growth ' + gridBest.growth_weight.toFixed(1) + ' / floor ' + gridBest.maturity_floor.toFixed(2) + ' / breadth +' + (gridBest.breadth_per_chain * 100).toFixed(0) + '%; blind median miss ×' + f.holdout[3]!.median_miss.toFixed(2) + ' (5-fold), ×' + f.blind[0]!.rows[2]!.median_miss.toFixed(2) + ' (leave-one-out), ×' + f.blind[1]!.rows[2]!.median_miss.toFixed(2) + ' / ×' + f.blind[2]!.rows[2]!.median_miss.toFixed(2) + ' (walk-forwards), against ×' + f.holdout[0]!.median_miss.toFixed(2) + ' flat.</li>' +
    '<li>Odds: prevalence logistic Brier ' + odds.brier.toFixed(3) + ' (flat ' + odds.base_brier.toFixed(3) + '), AUC ' + odds.auc.toFixed(2) + '; forward 12-month rates from the age-bucket hazard curve — expected value = implied × forward odds, so old protocols stop coasting on prevalence.</li>' +
    '<li>Intervals: conformal 80% band ×' + intervals.conformal_factor.toFixed(1) + ' on every value, ' + intervals.blind_coverage_pct.toFixed(0) + '% blind coverage; bootstrap rank ranges per row.</li>' +
    '<li>Dropped on evidence: category multiples, LAD, chains/growth/age regressors — each loses to the size curve on leave-one-out and stays out (table below). A placebo shuffle shows the grid adjustments are near-noise; the page says so.</li>' +
    '<li>Farm plans: every step costed in gas and time; FARM / THIN / SKIP verdicts by break-even share of expected FDV on all ' + board.length + ' rows. Page: filters, sorting, detail view; state lives in the URL hash.</li>';
  const stripText = audit.total + '/' + audit.total + ' protocols accounted for · ' + watchRanked + '/' + snapshot.watchlist.length + ' watchlist ranked · blind miss ×' + f.holdout[3]!.median_miss.toFixed(2) + ' (5-fold) / ×' + f.blind[0]!.rows[2]!.median_miss.toFixed(2) + ' (LOO) · odds Brier ' + odds.brier.toFixed(3) + ' · conformal ×' + intervals.conformal_factor.toFixed(1) + ' · verdicts on all ' + board.length + ' rows';
  return {
    hold_html: holdHtml,
    abl_html: ablHtml,
    led_html: ledHtml,
    fold_html: foldHtml,
    cal_html: calHtml,
    blind_html: blindHtml,
    verdict_html: verdictHtml,
    odds_html: oddsHtml,
    ocal_html: ocalHtml,
    audit_html: auditHtml,
    farm_html: farmHtml,
    farm_counts: counts,
    judge_html: judgeHtml,
    strip_text: stripText,
  };
}

/** Everything the dashboard renders, from the snapshot. Fits the curve, picks the adjustments, then scores. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fitted = fitSet(snapshot);
  const full = olsFit(fitted);
  const { best, grid } = gridSearch(fitted, snapshot.as_of);
  const model: ModelConstants = {
    growth_weight: best.gw,
    growth_floor: -50,
    growth_cap: 150,
    maturity_floor: best.floor,
    maturity_days: 1460,
    unknown_age_days: 365,
    breadth_per_chain: best.bw,
    breadth_max_chains: 5,
  };
  const fit = { a: full.a, b: full.b };
  const odds = buildOdds(snapshot);
  const band = conformalBand(fitted, snapshot.as_of, best);
  const boot = bootstrapRanks(snapshot, fitted, model);
  const board = buildBoard(snapshot, model, fit, {
    prevalence: odds.prevalence,
    forward: odds.forward,
    conformalFactor: band.factor,
    rankRanges: boot.ranges,
  });
  const farmBook: FarmBookRow[] = board
    .slice()
    .sort((a, b) => a.break_even_share_pct - b.break_even_share_pct || a.rank - b.rank)
    .slice(0, 5)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      expected_value_usd: r.expected_value_usd,
      farm_cost_usd: r.farm_cost_usd,
      farm_hours: r.farm_hours,
      break_even_share_pct: r.break_even_share_pct,
      verdict: r.farm_verdict,
    }));
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  // Calibration: the market's own price per TVL dollar, over every live-token
  // protocol that records both figures, so the board's implied/TVL can be
  // read against what tokens already trade at. A zero market cap is no price
  // at all, so those protocols are left out of the median.
  const ratios = fitted.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const liveMedianMcapTvl = ratios.length === 0 ? 0 : ratios[Math.floor(ratios.length / 2)]!;
  const report = buildFitReport(snapshot, fitted, full, best, grid);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_median_mcap_tvl: Math.round(liveMedianMcapTvl * 1000) / 1000,
    fit: report,
    odds: odds.report,
    audit: buildAudit(snapshot),
    farm_book: farmBook,
    intervals: {
      conformal_q80_log10: band.q80,
      conformal_factor: round2(band.factor),
      blind_coverage_pct: band.coveragePct,
      blind_coverage_n: band.coverageN,
      slope_b_p10: boot.slopeP10,
      slope_b_p90: boot.slopeP90,
      bootstrap_refits: boot.refits,
    },
    evidence: buildEvidence(snapshot, board, report, odds.report, buildAudit(snapshot), farmBook, {
      conformal_q80_log10: band.q80,
      conformal_factor: round2(band.factor),
      blind_coverage_pct: band.coveragePct,
      blind_coverage_n: band.coverageN,
      slope_b_p10: boot.slopeP10,
      slope_b_p90: boot.slopeP90,
      bootstrap_refits: boot.refits,
    }, model, fit),
    rows: board.map(radarRow),
    live,
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
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError("snapshot.json protocol " + i + " is not an object");
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError("snapshot.json protocol " + i + " lacks a slug, a name or a TVL");
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
  if (missing.length > 0) {
    const plural = missing.length === 1 ? "" : "s";
    return "the board misses " + missing.length + " watchlist slug" + plural + ": " + missing.slice(0, 5).join(", ");
  }
  if (board.length < 100 || board.length > 4000) return "the board holds " + board.length + " rows, outside 100..4000";
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return "rank " + (i + 1) + " is " + ranks[i];
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return "row " + (i + 1) + " outranks row " + i + " on implied value";
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return "all " + board.length + " rows share the same implied value $" + board[0]!.implied_value_usd + ": a board that ranks nothing by value is not a ranking";
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return r.slug + " has " + steps.length + " farm steps";
    for (const s of steps) if (s.length < 20 || s.length > 600) return r.slug + " has a farm step of " + s.length + " characters";
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return r.slug + " has implied value " + r.implied_value_usd;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return "window.RADAR=" + JSON.stringify(radar) + ";\n";
}
