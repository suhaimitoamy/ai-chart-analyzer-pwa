export function generateLiveNarrative(candles, currentPrice, tf) {
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

    let recentHigh = Math.max(...highs.slice(-3)); // get highest of last 3 swing highs
    let recentLow = Math.min(...lows.slice(-3));   // get lowest of last 3 swing lows

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
    
    // Simplistic MSS: price breaking recent swing
    if (currentPrice > recentHigh) {
        mssStatus = "Bullish MSS";
        mssStory = `Terdeteksi Bullish Market Structure Shift (MSS) di ${tf} karena harga baru saja menjebol Swing High (${recentHigh.toFixed(2)}). Menandakan potensi pergantian dominasi ke arah Buy.`;
    } else if (currentPrice < recentLow) {
        mssStatus = "Bearish MSS";
        mssStory = `Terdeteksi Bearish Market Structure Shift (MSS) di ${tf} akibat jebolnya Swing Low (${recentLow.toFixed(2)}). Penjual mulai mengambil alih kendali (Sell).`;
    } else {
        // Trend bias
        let close = lastCandles[lastCandles.length-1].close;
        let open = lastCandles[lastCandles.length-1].open;
        if (close > open && currentPrice > eq) {
            mssStory = `Dorongan pembeli di ${tf} masih terasa, mengarah naik mendekati area likuiditas atas.`;
        } else if (close < open && currentPrice < eq) {
            mssStory = `Tekanan jual di ${tf} masih dominan, harga ditarik turun mencari pijakan likuiditas bawah.`;
        }
    }

    // Liquidity Target (BSL/SSL)
    // Cari swing terdekat yang belum tertembus
    let bslTarget = highs.filter(h => h > currentPrice).sort((a,b)=>a-b)[0];
    let sslTarget = lows.filter(l => l < currentPrice).sort((a,b)=>b-a)[0];

    // Jika tidak ada swing terkonfirmasi (misal harga baru saja membuat rekor tertinggi/terendah baru),
    // kita ambil titik ekstrem (ujung jarum/wick) dari 20 candle terakhir sebagai target terdekat.
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
        liqNarrative = `Target Buy-Side Liquidity (BSL) terdekat: ${bslTarget.toFixed(2)}. Target Sell-Side Liquidity (SSL) terdekat: ${sslTarget.toFixed(2)}. Waspada area ini sering jadi tempat terjadinya 'Sweep' sebelum harga berbalik arah.`;
    } else if (bslTarget) {
        liqNarrative = `Target Buy-Side Liquidity (BSL) terdekat: ${bslTarget.toFixed(2)}. Harga sedang membuat lembah baru (terendah), sehingga belum ada jejak SSL historis di bawah harga saat ini.`;
    } else if (sslTarget) {
        liqNarrative = `Target Sell-Side Liquidity (SSL) terdekat: ${sslTarget.toFixed(2)}. Harga sedang membuat puncak baru (tertinggi), sehingga belum ada jejak BSL historis di atas harga saat ini.`;
    } else {
        liqNarrative = `Harga sedang berada di area pergerakan ekstrem tanpa jejak likuiditas terdekat yang jelas.`;
    }

    return {
        tf: tf,
        pdPos: pdPos,
        pdNarrative: pdNarrative,
        mssStatus: mssStatus,
        mssStory: mssStory,
        liqNarrative: liqNarrative,
        price: currentPrice
    };
}
