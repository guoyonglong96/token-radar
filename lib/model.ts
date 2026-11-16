// Token Radar, model radar-2: one sealed snapshot in, one ranked board out.
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
// Implied value follows only from the snapshot's own figures:
//
//   base     = tvl_usd x baseMultiple(tvl_usd)     (size-tiered FDV/TVL)
//   growth   = clamp(change_7d, -50, +150) per cent
//   growthM  = 1 + growth/100 x 0.6
//   maturity = 0.55 + 0.45 x min(age_days, 1460)/1460   (age unknown: 365)
//   breadth  = 1 + 0.02 x min(chains - 1, 5)
//   implied  = max(1, round(base x growthM x maturity x breadth)),
//              capped at the gate's $100,000,000,000,000, so no TVL,
//              however extreme, can write a value the gate refuses.
//
// Why these four factors. Size: a token's fully diluted value per dollar of
// TVL compresses as a protocol grows, so the multiple steps down in four TVL
// tiers instead of pretending a $5M pool and a $2.7B curator carry the same
// ratio. Growth: the last seven days are the only momentum the snapshot
// carries, so they move the value up or down, capped so one hot week cannot
// dominate. Maturity: age is the time a protocol has run with no token, and a
// longer pre-token run means a larger, stickier base waiting on a launch, so
// the factor rises from 0.55 for a newborn to 1.00 after four years. Breadth:
// a protocol live on more chains reaches more farmers, worth up to +10%.
//
// Live-token protocols are never ranked: they already trade, so the board
// shows their market cap as a fact in a separate view, never mixed into a
// model's implied value. Their median market-cap/TVL is the board's
// calibration: buildRadar records it, and the dashboard reads the board's
// implied/TVL range against it, so the multiples are checked against what
// tokens already trade at instead of asserted.
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
  /** FDV/TVL multiple by TVL tier: [under $100M, under $1B, under $5B, $5B and up]. */
  base_tiers: [number, number, number, number];
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Extra value per chain beyond the first, capped at five extra chains. */
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  base_tiers: [0.45, 0.35, 0.28, 0.22],
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

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

/** The dashboard's compact view of one row; the page rebuilds the farm plan from it. */
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
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
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
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The size-tiered FDV/TVL multiple for a TVL. */
export function baseMultiple(tvlUsd: number, model: ModelConstants): number {
  if (tvlUsd < 100_000_000) return model.base_tiers[0];
  if (tvlUsd < 1_000_000_000) return model.base_tiers[1];
  if (tvlUsd < 5_000_000_000) return model.base_tiers[2];
  return model.base_tiers[3];
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (1 - model.maturity_floor) * (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const base = baseMultiple(protocol.tvl_usd, model);
  const implied = Math.max(1, Math.min(100_000_000_000_000, Math.round(protocol.tvl_usd * base * growthMult * maturityMult * breadthMult)));
  return { implied, base, growthPct, growthMult, maturityMult, breadthMult, age };
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

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isRankable);
  const scored = candidates.map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.base,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
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

/** Whether a category name carries `word` as a word of its own: 'Indexes' is not a dex. */
function hasWord(c: string, word: string): boolean {
  return new RegExp(`\\b${word}`).test(c);
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (hasWord(c, 'dex') || c.includes('swap')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('cedefi')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('basis trading')) return `Deposit $${capital} into a ${name} basis vault on ${chain} and keep the shares.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} managed liquidity vault on ${chain} and keep the shares.`;
  if (c.includes('yield aggregator') || c.includes('leveraged farm')) return `Deposit $${capital} into ${name}'s main yield vault on ${chain} and keep the shares.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s highest-TVL yield pool on ${chain} and keep the position open.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s main farm on ${chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it.`;
  if (c.includes('anchor btc') || c.includes('decentralized btc')) return `Mint $${capital} of ${name}'s BTC-backed asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Send $${capital} through ${name} on ${chain} and keep the channel open.`;
  if (c.includes('otc')) return `Place a $${capital} order on ${name} on ${chain} and keep the position open.`;
  if (c.includes('card')) return `Load $${capital} onto a ${name} card on ${chain} and make one small purchase.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s incentives vault on ${chain} and keep the shares.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in its app.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} through its official bridge, then use one flagship app on it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action, so the farm is a pattern of use, not one deposit. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $10 against the supply on ${name}, then repay it the same week.`;
  if (hasWord(c, 'dex') || c.includes('swap')) return `Swap $10 through ${name}'s main pool on ${chain}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('cedefi') || c.includes('basis trading') || c.includes('liquidity manager') || c.includes('governance')) return `Deposit $10 more into a second ${name} vault on ${chain}.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Claim or compound the yield the ${name} position earned, even if it is small.`;
  if (c.includes('farm')) return `Harvest the rewards the ${name} farm paid, or compound them back into the position.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close the hedge on ${name}, then open a fresh one half its size.`;
  if (c.includes('prediction')) return `Settle or close the first position on ${name}, then place a second one.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the staking rewards ${name} paid, or claim them to the same wallet.`;
  if (c.includes('stable')) return `Swap $10 of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Check the yield ${name} accrued and leave it compounding in the position.`;
  if (c.includes('anchor btc') || c.includes('decentralized btc')) return `Check the yield ${name}'s BTC-backed asset accrued and leave it compounding.`;
  if (c.includes('insurance')) return `Open the ${name} policy page and confirm the cover is still active.`;
  if (c.includes('payment')) return `Make a second $10 payment through ${name}.`;
  if (c.includes('otc')) return `Fill a second $10 order on ${name}.`;
  if (c.includes('card')) return `Make a second small purchase with the ${name} card.`;
  if (c.includes('index')) return `Check what the ${name} index holds and hold the position through the next rebalance.`;
  if (c.includes('bridge')) return `Bridge $10 back through ${name}, or use the bridged funds in a second app on ${chain}.`;
  if (c.includes('chain')) return `Use a second app on the chain, such as its main swap or lending market.`;
  return `Make a second $10 deposit into ${name} on ${chain}, or use a second feature of it.`;
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
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: gas.first,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas.tx}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: gas.tx,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: gas.weekly,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own rewards page, if it has one, and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind in steps and keep $5 of gas in the wallet.`,
      cost: gas.exit,
      time: '15 minutes to unwind',
    },
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

/** A board row's compact form for data.js, with the farm plan generated in the page. */
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
    base_multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist: row.watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  // Calibration: the market's own price per TVL dollar, over every live-token
  // protocol that records both figures, so the board's implied/TVL can be
  // read against what tokens already trade at. A zero market cap is no price
  // at all, so those protocols are left out of the median.
  const ratios = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  const liveMedianMcapTvl = ratios.length === 0 ? 0 : ratios[Math.floor(ratios.length / 2)]!;
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
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
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
