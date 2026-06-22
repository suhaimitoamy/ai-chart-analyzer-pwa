import re
with open('src/App.jsx', 'r') as f:
    content = f.read()

start_idx = content.find('function atr(cs)')
end_idx = content.find('function defConcepts(s)')

if start_idx == -1 or end_idx == -1:
    print("Could not find start or end markers!")
    exit(1)

js_code = """
function getSwings(candles, left=2, right=2) {
    if (candles.length < left + right + 1) return { highs: [], lows: [] };
    let highs = [], lows = [];
    for (let i = left; i < candles.length - right; i++) {
        let high = candles[i].high, low = candles[i].low;
        let isHigh = true, isLow = true;
        for (let j = 1; j <= left; j++) {
            if (candles[i - j].high >= high) isHigh = false;
            if (candles[i - j].low <= low) isLow = false;
        }
        for (let j = 1; j <= right; j++) {
            if (candles[i + j].high >= high) isHigh = false;
            if (candles[i + j].low <= low) isLow = false;
        }
        if (isHigh) highs.push(candles[i]);
        if (isLow) lows.push(candles[i]);
    }
    return { highs, lows };
}

function calculateBias(candles) {
    if (candles.length < 10) return "neutral";
    let { highs, lows } = getSwings(candles);
    if (highs.length >= 2 && lows.length >= 2) {
        let hh = highs[highs.length - 1].high > highs[highs.length - 2].high;
        let hl = lows[lows.length - 1].low > lows[lows.length - 2].low;
        let lh = highs[highs.length - 1].high < highs[highs.length - 2].high;
        let ll = lows[lows.length - 1].low < lows[lows.length - 2].low;
        if (hh && hl) return "bullish";
        if (lh && ll) return "bearish";
        if (hh && ll) return "expanding";
        if (lh && hl) return "choppy";
    }
    let closes = candles.slice(-5).map(c => c.close);
    let avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    return candles[candles.length - 1].close > avg ? "bullish" : "bearish";
}

function isChoppy(candles) {
    if (candles.length < 5) return false;
    let choppyCount = candles.slice(-5).filter(c => {
        let body = Math.abs(c.open - c.close);
        let range = c.high - c.low;
        return range > 0 && body / range < 0.3;
    }).length;
    return choppyCount >= 3;
}

function calculateAtr(candles) {
    let ranges = candles.slice(-14).map(c => c.high - c.low);
    return ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
}

function buildStructureState(candles, swingHighs, swingLows, bias, nearestSupport, nearestResistance, choppy) {
    let latest = candles[candles.length - 1];
    let body = Math.abs(latest.open - latest.close);
    let range = latest.high - latest.low;
    let momentum = (range > 0 && body / range >= 0.5) ? (latest.close > latest.open ? "bullish" : "bearish") : "neutral";

    let liquidity = "No fresh liquidity sweep on latest closed candle";
    let lastLow = swingLows[swingLows.length - 1];
    if (lastLow && latest.low < lastLow.low && latest.close > lastLow.low) {
        liquidity = `Sell-side liquidity swept at ${p2(lastLow.low)}, reclaimed at ${p2(latest.close)}`;
    }
    let lastHigh = swingHighs[swingHighs.length - 1];
    if (liquidity.startsWith("No fresh") && lastHigh && latest.high > lastHigh.high && latest.close < lastHigh.high) {
        liquidity = `Buy-side liquidity swept at ${p2(lastHigh.high)}, reclaimed at ${p2(latest.close)}`;
    }

    let breakType = "None", breakLevel = null;
    if (swingHighs.length > 0 && latest.close > swingHighs[swingHighs.length - 1].high) {
        breakLevel = swingHighs[swingHighs.length - 1].high;
        breakType = bias === "bearish" ? "MSS_BULLISH" : "BOS_BULLISH";
    } else if (swingLows.length > 0 && latest.close < swingLows[swingLows.length - 1].low) {
        breakLevel = swingLows[swingLows.length - 1].low;
        breakType = bias === "bullish" ? "MSS_BEARISH" : "BOS_BEARISH";
    }

    let middleOfRange = false;
    if (nearestSupport !== null && nearestResistance !== null) {
        let fullRange = nearestResistance - nearestSupport;
        let pos = fullRange > 0 ? (latest.close - nearestSupport) / fullRange : 0;
        middleOfRange = pos >= 0.4 && pos <= 0.6;
    }

    let phase = "RANGING";
    if (choppy) phase = "CHOPPY";
    else if (breakType !== "None") phase = "EXPANSION";
    else if (middleOfRange) phase = "RANGING";
    else if (bias === "bullish") phase = "PULLBACK_OR_MARKUP";
    else if (bias === "bearish") phase = "PULLBACK_OR_MARKDOWN";

    let retest = "NONE";
    if (breakType !== "None" && breakLevel !== null) {
        let dist = Math.abs(latest.close - breakLevel);
        retest = dist > 3.0 ? `WAIT_PULLBACK_TO_${p2(breakLevel)}` : `ACTIVE_RETEST_${breakType}`;
    }

    return { phase, breakStr: breakLevel !== null ? `${breakType} at ${p2(breakLevel)}` : breakType, retest, momentum, liquidity, breakType };
}

function findLatestFvg(candles) {
    if (candles.length < 3) return { bullish: "-", bearish: "-", summary: "Belum cukup candle untuk FVG", direction: "none" };
    for (let i = candles.length - 1; i >= 2; i--) {
        let left = candles[i - 2], right = candles[i];
        if (left.high < right.low) return { bullish: `${p2(left.high)} - ${p2(right.low)}`, bearish: "-", summary: `Bullish FVG ${p2(left.high)} - ${p2(right.low)}`, direction: "bullish" };
        if (left.low > right.high) return { bullish: "-", bearish: `${p2(right.high)} - ${p2(left.low)}`, summary: `Bearish FVG ${p2(right.high)} - ${p2(left.low)}`, direction: "bearish" };
    }
    return { bullish: "-", bearish: "-", summary: "No clear FVG in recent candles", direction: "none" };
}

function findOrderBlock(candles) {
    let recent = candles.slice(-20);
    let bullishOb = [...recent].reverse().find(c => c.close < c.open);
    let bearishOb = [...recent].reverse().find(c => c.close > c.open);
    let bullish = bullishOb ? `${p2(bullishOb.low)} - ${p2(bullishOb.high)}` : "-";
    let bearish = bearishOb ? `${p2(bearishOb.low)} - ${p2(bearishOb.high)}` : "-";
    let summary = "Order block reference belum ditemukan";
    if (bullish !== "-" && bearish !== "-") summary = `Bullish OB ${bullish} | Bearish OB ${bearish}`;
    else if (bullish !== "-") summary = `Bullish OB ${bullish}`;
    else if (bearish !== "-") summary = `Bearish OB ${bearish}`;
    return { bullish, bearish, summary };
}

function calculateConfidence(bias, choppy, hasSweep, hasFvg, hasOb) {
    let score = bias === "NEUTRAL" ? 35 : 55;
    if (hasSweep) score += 10;
    if (hasFvg) score += 10;
    if (hasOb) score += 10;
    if (choppy) score -= 15;
    return Math.max(25, Math.min(85, score));
}

function buildTradeSetup(bias, currentPrice, currentZone, nearestSupport, nearestResistance, high60, low60, atr, fvg, ob) {
    if (bias === "BULLISH") {
        let entryZone = fvg.bullish !== "-" ? fvg.bullish : (ob.bullish !== "-" ? ob.bullish : `${p2(nearestSupport)} - ${p2(currentPrice)}`);
        let valid = currentZone === "DISCOUNT" && (fvg.bullish !== "-" || ob.bullish !== "-");
        let sl = Math.min(nearestSupport, low60) - atr;
        return { status: valid ? "ACTIVE" : "WAIT", entry: entryZone, tp1: nearestResistance, tp2: high60, stop: sl };
    } else if (bias === "BEARISH") {
        let entryZone = fvg.bearish !== "-" ? fvg.bearish : (ob.bearish !== "-" ? ob.bearish : `${p2(currentPrice)} - ${p2(nearestResistance)}`);
        let valid = currentZone === "PREMIUM" && (fvg.bearish !== "-" || ob.bearish !== "-");
        let sl = Math.max(nearestResistance, high60) + atr;
        return { status: valid ? "ACTIVE" : "WAIT", entry: entryZone, tp1: nearestSupport, tp2: low60, stop: sl };
    } else {
        return { status: "WAIT", entry: "Belum ada zona entry valid", tp1: 0, tp2: 0, stop: 0 };
    }
}

function analyze(candles, htfCs, tf, session, livePrice) {
    if (candles.length < 60) return { bias: "NEUTRAL", confidence: 25, summary: "Candle belum cukup (min 60).", concepts: [], setup: { status: "WAIT", entry: "-", tp1: 0, tp2: 0, stop: 0 } };
    let recent = candles.slice(-60);
    let latest = recent[recent.length - 1];
    let currentPrice = livePrice || latest.close;
    let previous = recent.slice(0, -1);
    let last20 = previous.slice(-20).length ? previous.slice(-20) : recent;
    let high20 = Math.max(...last20.map(c => c.high));
    let low20 = Math.min(...last20.map(c => c.low));
    let high60 = Math.max(...recent.map(c => c.high));
    let low60 = Math.min(...recent.map(c => c.low));
    let eq = (high60 + low60) / 2.0;
    let currentZone = currentPrice > eq ? "PREMIUM" : currentPrice < eq ? "DISCOUNT" : "EQUILIBRIUM";

    let { highs: swingHighs, lows: swingLows } = getSwings(recent);
    let nearestSupport = swingLows.map(s => s.low).filter(l => l < currentPrice).sort((a, b) => b - a)[0] || low20;
    let nearestResistance = swingHighs.map(s => s.high).filter(h => h > currentPrice).sort((a, b) => a - b)[0] || high20;
    
    let rawBias = calculateBias(recent);
    let choppy = isChoppy(recent);
    let atrVal = calculateAtr(recent);
    if (atrVal <= 0) atrVal = Math.max(1.0, (high60 - low60) / 10.0);
    
    let structure = buildStructureState(recent, swingHighs, swingLows, rawBias, nearestSupport, nearestResistance, choppy);
    let fvg = findLatestFvg(recent);
    let ob = findOrderBlock(recent);

    let bias = "NEUTRAL";
    if (rawBias === "bearish" || (structure.momentum === "bearish" && currentPrice < eq)) bias = "BEARISH";
    if (rawBias === "bullish" || (structure.momentum === "bullish" && currentPrice > eq)) bias = "BULLISH";

    let hasSweep = !structure.liquidity.startsWith("No fresh");
    let hasDirectionalFvg = (bias === "BULLISH" && fvg.bullish !== "-") || (bias === "BEARISH" && fvg.bearish !== "-");
    let hasDirectionalOb = (bias === "BULLISH" && ob.bullish !== "-") || (bias === "BEARISH" && ob.bearish !== "-");
    let confidence = calculateConfidence(bias, choppy, hasSweep, hasDirectionalFvg, hasDirectionalOb);
    let setup = buildTradeSetup(bias, currentPrice, currentZone, nearestSupport, nearestResistance, high60, low60, atrVal, fvg, ob);

    let zoneText = currentZone === "PREMIUM" ? "premium" : currentZone === "DISCOUNT" ? "diskon" : "equilibrium";
    let summary = bias === "BULLISH" ? `Market dalam fase ${structure.phase} dengan bias bullish. Harga berada di zona ${zoneText}, resistance terdekat berada di ${p2(nearestResistance)}, dan struktur masih mendukung skenario buy selektif.` :
                 bias === "BEARISH" ? `Market dalam fase ${structure.phase} dengan bias bearish. Harga berada di zona ${zoneText}, support terdekat berada di ${p2(nearestSupport)}, dan struktur masih menekan harga ke bawah.` :
                 `Market dalam fase ${structure.phase} dengan bias netral. Harga berada di zona ${zoneText} dan belum ada konfirmasi struktur yang cukup kuat untuk entry agresif.`;

    let concept = (title, status, tf_label, value) => ({ title, status, tf: tf_label, value });
    
    return {
        bias,
        confidence,
        summary,
        setup,
        concepts: [
            concept("Market Structure", structure.breakStr === "None" ? "NONE" : "ACTIVE", tf, structure.breakStr === "None" ? "Belum ada CHoCH/MSS baru" : structure.breakStr),
            concept("Order Block", (bias==="BULLISH" && ob.bullish!=="-")||(bias==="BEARISH" && ob.bearish!=="-") ? "ACTIVE" : "CONTEXT", tf, ob.summary),
            concept("Fair Value Gap", (bias==="BULLISH" && fvg.bullish!=="-")||(bias==="BEARISH" && fvg.bearish!=="-") ? "ACTIVE" : "CONTEXT", tf, fvg.summary),
            concept("Liquidity", hasSweep ? "ACTIVE" : "WAIT", tf, structure.liquidity),
            concept("HTF Premium/Discount", "ACTIVE", tf, `Harga di zona ${currentZone}. EQ ${p2(eq)}`),
            concept("Kill Zone", session.active ? "ACTIVE" : "WAIT", "AUTO", session.name),
            concept("Trade Setup", setup.status, tf, setup.entry)
        ]
    };
}
"""

new_content = content[:start_idx] + js_code + content[end_idx:]

with open('src/App.jsx', 'w') as f:
    f.write(new_content)
print("Patched App.jsx successfully.")
