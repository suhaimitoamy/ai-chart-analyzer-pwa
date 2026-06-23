export function generateLiveNarrative(candles, currentPrice, tf, session) {
    if (!candles || candles.length < 20) return null;

    // 1. Calculate Swings (Lookback 5)
    let highs = [], lows = [];
    for (let i = 5; i < candles.length - 5; i++) {
        let isHigh = true, isLow = true;
        for (let j = 1; j <= 5; j++) {
            if (candles[i].high <= candles[i-j].high || candles[i].high <= candles[i+j].high) isHigh = false;
            if (candles[i].low >= candles[i-j].low || candles[i].low >= candles[i+j].low) isLow = false;
        }
        if (isHigh) highs.push(candles[i].high);
        if (isLow) lows.push(candles[i].low);
    }

    if (highs.length === 0 || lows.length === 0) return null;

    let recentHigh = Math.max(...highs.slice(-3));
    let recentLow = Math.min(...lows.slice(-3));

    // Dealing Range (Premium / Discount)
    let range = recentHigh - recentLow;
    let eq = recentLow + (range / 2);
    let pdPos = "";
    let pdNarrative = "";

    if (currentPrice > eq + (range * 0.1)) {
        pdPos = "Premium";
        pdNarrative = "Harga saat ini berada di zona Premium (Mahal). Ideal untuk mencari setup Sell, hindari memaksakan Buy di pucuk.";
    } else if (currentPrice < eq - (range * 0.1)) {
        pdPos = "Discount";
        pdNarrative = "Harga saat ini berada di zona Discount (Murah). Momen probabilitas tinggi untuk mencari pantulan Buy dari Order Block.";
    } else {
        pdPos = "Equilibrium";
        pdNarrative = "Harga sedang berada di tengah-tengah (Equilibrium). Konsolidasi sering terjadi di sini, tunggu pergerakan ke ujung rentang.";
    }

    // Market Structure Shift (MSS) estimation
    let lastCandles = candles.slice(-5);
    let mssStatus = "Netral";
    let mssStory = `Struktur ${tf} terpantau mengalir sesuai tren, belum ada perubahan drastis.`;
    
    if (currentPrice > recentHigh) {
        mssStatus = "Bullish MSS";
        mssStory = `Terdeteksi Bullish Market Structure Shift (MSS) di ${tf} karena harga baru saja menjebol Swing High (${recentHigh.toFixed(2)}). Menandakan potensi pergantian dominasi ke arah Buy.`;
    } else if (currentPrice < recentLow) {
        mssStatus = "Bearish MSS";
        mssStory = `Terdeteksi Bearish Market Structure Shift (MSS) di ${tf} akibat jebolnya Swing Low (${recentLow.toFixed(2)}). Penjual mulai mengambil alih kendali (Sell).`;
    } else {
        let close = lastCandles[lastCandles.length-1].close;
        let open = lastCandles[lastCandles.length-1].open;
        if (close > open && currentPrice > eq) {
            mssStatus = "Bullish";
            mssStory = `Dorongan pembeli di ${tf} masih terasa, mengarah naik mendekati area likuiditas atas.`;
        } else if (close < open && currentPrice < eq) {
            mssStatus = "Bearish";
            mssStory = `Tekanan jual di ${tf} masih dominan, harga ditarik turun mencari pijakan likuiditas bawah.`;
        }
    }

    // Liquidity Target (BSL/SSL)
    let bslTarget = highs.filter(h => h > currentPrice).sort((a,b)=>a-b)[0];
    let sslTarget = lows.filter(l => l < currentPrice).sort((a,b)=>b-a)[0];

    if (!bslTarget) {
        let recentMax = Math.max(...candles.slice(-20).map(c=>c.high));
        if (recentMax > currentPrice) bslTarget = recentMax;
    }
    if (!sslTarget) {
        let recentMin = Math.min(...candles.slice(-20).map(c=>c.low));
        if (recentMin < currentPrice) sslTarget = recentMin;
    }

    let liqNarrative = "";
    if (bslTarget && sslTarget) {
        liqNarrative = `Target Buy-Side Liquidity (BSL) terdekat: ${bslTarget.toFixed(2)}. Target Sell-Side Liquidity (SSL) terdekat: ${sslTarget.toFixed(2)}.`;
    } else if (bslTarget) {
        liqNarrative = `Target Buy-Side Liquidity (BSL) terdekat: ${bslTarget.toFixed(2)}. Harga sedang membuat lembah baru (terendah), belum ada jejak SSL historis di bawah harga saat ini.`;
    } else if (sslTarget) {
        liqNarrative = `Target Sell-Side Liquidity (SSL) terdekat: ${sslTarget.toFixed(2)}. Harga sedang membuat puncak baru (tertinggi), belum ada jejak BSL historis di atas harga saat ini.`;
    } else {
        liqNarrative = `Harga sedang berada di area pergerakan ekstrem tanpa jejak likuiditas terdekat yang jelas.`;
    }

    // Time & Price Narrative
    let timeNarrative = "Saat ini market berada di luar jam sibuk (Dead Zone). Volatilitas cenderung rendah, waspadai pergerakan palsu (choppy).";
    if (session && session.active) {
        timeNarrative = `Saat ini berada di dalam sesi ${session.name}. Volatilitas institusi aktif, probabilitas pergerakan terarah mencapai target likuiditas sangat tinggi.`;
    }

    // FVG Detector (Imbalance)
    let fvgNarrative = "Tidak ada jejak Fair Value Gap (FVG) segar di dekat harga saat ini. Pergerakan terpantau seimbang.";
    let foundFvg = false;
    for (let i = candles.length - 3; i >= Math.max(0, candles.length - 20); i--) {
        let c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
        if (!c1 || !c2 || !c3) continue;
        // Bullish FVG: c1.high < c3.low
        if (c1.high < c3.low && currentPrice >= c1.high) {
            fvgNarrative = `Terdapat celah Imbalance (Bullish FVG) di area ${c1.high.toFixed(2)} - ${c3.low.toFixed(2)}. Area ini dapat bertindak sebagai magnet pijakan pantulan naik.`;
            foundFvg = true; break;
        }
        // Bearish FVG: c1.low > c3.high
        if (c1.low > c3.high && currentPrice <= c1.low) {
            fvgNarrative = `Terdapat celah Imbalance (Bearish FVG) di area ${c3.high.toFixed(2)} - ${c1.low.toFixed(2)}. Area ini dapat bertindak sebagai magnet pijakan pantulan turun.`;
            foundFvg = true; break;
        }
    }

    // Draw on Liquidity (DOL) Synthesizer
    let dolNarrative = "Menunggu momentum yang lebih jelas untuk menentukan arah magnet likuiditas utama.";
    if (mssStatus.includes("Bullish") && pdPos === "Discount") {
        let bslStr = bslTarget ? `Buy-Side Liquidity (BSL) di ${bslTarget.toFixed(2)}` : "Buy-Side Liquidity (BSL)";
        dolNarrative = `Berdasarkan momentum Bullish dari area Discount, magnet pergerakan harga saat ini tertuju kuat ke ${bslStr}.`;
    } else if (mssStatus.includes("Bearish") && pdPos === "Premium") {
        let sslStr = sslTarget ? `Sell-Side Liquidity (SSL) di ${sslTarget.toFixed(2)}` : "Sell-Side Liquidity (SSL)";
        dolNarrative = `Berdasarkan momentum Bearish dari area Premium, magnet pergerakan harga saat ini tertuju kuat ke ${sslStr}.`;
    } else if (mssStatus.includes("Bullish") && pdPos === "Premium") {
        dolNarrative = `Harga memang condong Bullish, namun sudah berada di zona Premium (Mahal). Waspada potensi koreksi mengambil Liquidity bawah (SSL) sebelum melanjutkan kenaikan.`;
    } else if (mssStatus.includes("Bearish") && pdPos === "Discount") {
        dolNarrative = `Harga memang condong Bearish, namun sudah berada di zona Discount (Murah). Waspada potensi pantulan mengambil Liquidity atas (BSL) sebelum melanjutkan penurunan.`;
    }

    return {
        tf: tf,
        pdPos: pdPos,
        pdNarrative: pdNarrative,
        mssStatus: mssStatus,
        mssStory: mssStory,
        liqNarrative: liqNarrative,
        timeNarrative: timeNarrative,
        fvgNarrative: fvgNarrative,
        dolNarrative: dolNarrative,
        price: currentPrice
    };
}
