/**
 * نرخهای لحظهای: تتر/تومان، بیتکوین/تتر، اتریوم/تتر
 *
 * منابع:
 *  - nerkh.jahankhahan.shop : تتر و بیتکوین به تومان + تغییر ۲۴ ساعته (بدون کلید)
 *  - CoinGecko simple/price : اتریوم و تتر به USD (برای محاسبه ETH/USDT)
 *
 * BTC/USDT = بیتکوینِ تومان ÷ تترِ تومان  (همان نرخ بازار داخلی)
 * ETH/USDT = اتریومِ USD ÷ تترِ USD
 */
export const config = { runtime: 'nodejs', maxDuration: 10 };

const NERKH = 'https://nerkh.jahankhahan.shop/data/live.json';
const CG = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,tether&vs_currencies=usd&include_24hr_change=true';

let cache = null;
let cacheTs = 0;
const TTL = 60_000;

async function getJSON(url, ms = 7000) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { 'User-Agent': 'BambooDrop/1.0', Accept: 'application/json' }
  });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);

async function build() {
  const [nerkh, cg] = await Promise.all([
    getJSON(NERKH),
    getJSON(CG).catch(() => null)   // CoinGecko اختیاری است؛ نوار بدون ETH هم کار میکند
  ]);

  const r = nerkh.rates || {};
  const ch = nerkh.change || {};
  const tetherIRR = num(r.tether);
  const btcIRR = num(r.bitcoin);
  if (!tetherIRR) throw new Error('no tether rate');

  const ethUSD = num(cg?.ethereum?.usd);
  const tetherUSD = num(cg?.tether?.usd);

  const prices = {
    usdt: {
      irr: tetherIRR,
      change: Number.isFinite(+ch.tether) ? +ch.tether : null
    },
    btc: {
      irr: btcIRR,
      usdt: btcIRR ? +(btcIRR / tetherIRR).toFixed(2) : null,
      change: Number.isFinite(+ch.bitcoin) ? +ch.bitcoin : null
    }
  };

  if (ethUSD && tetherUSD) {
    prices.eth = {
      usdt: +(ethUSD / tetherUSD).toFixed(2),
      change: Number.isFinite(+cg.ethereum.usd_24h_change)
        ? +cg.ethereum.usd_24h_change.toFixed(2)
        : null
    };
  }

  return {
    prices,
    updatedAt: new Date().toISOString(),
    marketDate: nerkh.date || null,
    marketTime: nerkh.time || null,
    source: 'nerkh + coingecko',
    stale: false
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  try {
    if (!cache || Date.now() - cacheTs > TTL) {
      cache = await build();
      cacheTs = Date.now();
    }
    res.status(200).json(cache);
  } catch (e) {
    // در صورت شکست منبع، آخرین نرخ کششده را با پرچم stale برمیگردانیم
    if (cache) {
      res.status(200).json({ ...cache, stale: true, error: e.message });
    } else {
      res.status(503).json({ error: e.message });
    }
  }
}
