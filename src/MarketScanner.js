const p2 = v => v ? Number(v).toFixed(2) : "-";

function atr(rows) {
  let ranges = rows.slice(-14).map(c => c.high - c.low).filter(r => r > 0);
  let sum = ranges.reduce((a, b) => a + b, 0);
  return ranges.length ? sum / ranges.length : 0.50;
}

function bodyRatio(c) {
  let range = Math.max(c.high - c.low, 0.0001);
  return Math.abs(c.close - c.open) / range;
}

function pivotsHigh(rows, left, right) {
  let out = [];
  if (rows.length <= left + right) return out;
  for (let i = left; i < rows.length - right; i++) {
    let level = rows[i].high;
    let isHigh = true;
    for (let j = 1; j <= left; j++) if (rows[i - j].high >= level) isHigh = false;
    for (let j = 1; j <= right; j++) if (rows[i + j].high >= level) isHigh = false;
    if (isHigh) out.push({ index: i, level: level });
  }
  return out;
}

function pivotsLow(rows, left, right) {
  let out = [];
  if (rows.length <= left + right) return out;
  for (let i = left; i < rows.length - right; i++) {
    let level = rows[i].low;
    let isLow = true;
    for (let j = 1; j <= left; j++) if (rows[i - j].low <= level) isLow = false;
    for (let j = 1; j <= right; j++) if (rows[i + j].low <= level) isLow = false;
    if (isLow) out.push({ index: i, level: level });
  }
  return out;
}

function inferTrend(highs, lows) {
  let h = highs.map(x => x.level);
  let l = lows.map(x => x.level);
  let hh = h.length >= 2 && h[h.length - 1] > h[h.length - 2];
  let hl = l.length >= 2 && l[l.length - 1] > l[l.length - 2];
  let lh = h.length >= 2 && h[h.length - 1] < h[h.length - 2];
  let ll = l.length >= 2 && l[l.length - 1] < l[l.length - 2];
  if (hh && hl) return "bullish";
  if (lh && ll) return "bearish";
  return "range";
}

function findBullishOb(rows, from, to) {
  if (to <= from + 1) return null;
  let idx = -1, low = Infinity;
  for (let i = from + 1; i < to; i++) {
    if (rows[i].low < low) { low = rows[i].low; idx = i; }
  }
  if (idx >= 0) return { low: Math.min(rows[idx].open, rows[idx].close), high: Math.max(rows[idx].open, rows[idx].close), idx };
  return null;
}

function findBearishOb(rows, from, to) {
  if (to <= from + 1) return null;
  let idx = -1, high = -Infinity;
  for (let i = from + 1; i < to; i++) {
    if (rows[i].high > high) { high = rows[i].high; idx = i; }
  }
  if (idx >= 0) return { low: Math.min(rows[idx].open, rows[idx].close), high: Math.max(rows[idx].open, rows[idx].close), idx };
  return null;
}

export function scanEvents(tf, candles, livePrice) {
  let rows = [...candles].sort((a, b) => a.time - b.time).slice(-180);
  if (rows.length < 8) return [];
  
  let price = livePrice || rows[rows.length - 1].close;
  let a = Math.max(atr(rows), 0.05);
  let events = [];

  let latest = rows[rows.length - 1];
  let highs = pivotsHigh(rows, 3, 2);
  let lows = pivotsLow(rows, 3, 2);
  let lastHigh = highs.filter(x => x.index < rows.length - 2).pop();
  let lastLow = lows.filter(x => x.index < rows.length - 2).pop();
  let trend = inferTrend(highs, lows);

  // Structure
  if (lastHigh && latest.close > lastHigh.level) {
    let tag = trend === "bearish" ? "MSS" : "BOS";
    events.push({ key: `${tf}-${tag}-BULL-${lastHigh.index}-${p2(lastHigh.level)}`, p: 95, t: `[${tf}] ${tag} Bullish confirmed @ ${p2(lastHigh.level)}` });
  }
  if (lastLow && latest.close < lastLow.level) {
    let tag = trend === "bullish" ? "MSS" : "BOS";
    events.push({ key: `${tf}-${tag}-BEAR-${lastLow.index}-${p2(lastLow.level)}`, p: 95, t: `[${tf}] ${tag} Bearish confirmed @ ${p2(lastLow.level)}` });
  }

  // Displacement
  let move = Math.abs(latest.close - latest.open);
  if (move >= a * 1.5 && bodyRatio(latest) >= 0.65) {
    let dir = latest.close > latest.open ? "BULLISH" : "BEARISH";
    events.push({ key: `${tf}-DISP-${dir}-${latest.time}`, p: 78, t: `[${tf}] ${dir} displacement C:${p2(latest.close)}` });
  }

  // FVG
  if (rows.length >= 3) {
    let i = rows.length - 1;
    let left = rows[i - 2], mid = rows[i - 1], right = rows[i];
    let minGap = Math.max(a * 0.03, 0.02);
    let impulse = bodyRatio(mid) >= 0.50 || (mid.high - mid.low) >= a;
    if (impulse && right.low > left.high && right.low - left.high >= minGap) {
      let status = Math.abs(((left.high + right.low) / 2) - price) <= a * 10 ? "ACTIVE" : "CONTEXT";
      events.push({ key: `${tf}-FVG-BULL-${right.time}`, p: 84, t: `[${tf}] Bullish FVG ${status} ${p2(left.high)} - ${p2(right.low)}` });
    }
    if (impulse && right.high < left.low && left.low - right.high >= minGap) {
      let status = Math.abs(((right.high + left.low) / 2) - price) <= a * 10 ? "ACTIVE" : "CONTEXT";
      events.push({ key: `${tf}-FVG-BEAR-${right.time}`, p: 84, t: `[${tf}] Bearish FVG ${status} ${p2(right.high)} - ${p2(left.low)}` });
    }
  }

  // OB
  if (lastHigh && latest.close > lastHigh.level) {
    let ob = findBullishOb(rows, lastHigh.index, rows.length - 1);
    if (ob) events.push({ key: `${tf}-OB-BULL-${ob.idx}`, p: 82, t: `[${tf}] Bullish OB created ${p2(ob.low)} - ${p2(ob.high)}` });
  }
  if (lastLow && latest.close < lastLow.level) {
    let ob = findBearishOb(rows, lastLow.index, rows.length - 1);
    if (ob) events.push({ key: `${tf}-OB-BEAR-${ob.idx}`, p: 82, t: `[${tf}] Bearish OB created ${p2(ob.low)} - ${p2(ob.high)}` });
  }

  // Liquidity Sweeps
  let buySide = Math.min(...highs.map(x=>x.level).filter(x=>x>latest.close)) || Math.max(...rows.slice(-60).map(x=>x.high));
  let sellSide = Math.max(...lows.map(x=>x.level).filter(x=>x<latest.close)) || Math.min(...rows.slice(-60).map(x=>x.low));
  let tol = Math.max(a * 0.10, 0.05);
  let range = Math.max(latest.high - latest.low, 0.0001);
  let topWick = (latest.high - Math.max(latest.open, latest.close)) / range;
  let botWick = (Math.min(latest.open, latest.close) - latest.low) / range;

  if (latest.high > buySide + tol && latest.close < buySide && topWick >= 0.30) {
    events.push({ key: `${tf}-SWEPT-BSL-${latest.time}`, p: 98, t: `[${tf}] BSL swept @ ${p2(buySide)}` });
  }
  if (latest.low < sellSide - tol && latest.close > sellSide && botWick >= 0.30) {
    events.push({ key: `${tf}-SWEPT-SSL-${latest.time}`, p: 98, t: `[${tf}] SSL swept @ ${p2(sellSide)}` });
  }

  return events.sort((a,b)=>b.p - a.p).slice(0,12);
}
