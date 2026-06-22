import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BarChart3, Clock3, Cpu, History, KeyRound, Radio, Settings, Terminal, Zap, Download } from "lucide-react";
import { scanEvents } from "./MarketScanner.js";

const TF = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 };
const p2 = v => v ? Number(v).toFixed(2) : "-"; 
const money = v => v ? `$$${Number(v).toFixed(2)}` : "Waiting...";

function time(ms, zone="Asia/Jakarta", sec=true){ return new Intl.DateTimeFormat("en-GB",{timeZone:zone,hour:"2-digit",minute:"2-digit",second:sec?"2-digit":undefined,hour12:false}).format(new Date(ms)) }
function dtext(ms){ return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(new Date(ms)) }
function parts(ms,zone){ let p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(ms)); let g=t=>Number(p.find(x=>x.type===t)?.value); return{y:g("year"),m:g("month"),d:g("day")} }
function localToUtc(zone,h,m,now){ let a=parts(now,zone), guess=Date.UTC(a.y,a.m-1,a.d,h,m,0), txt=time(guess,zone,false), [hh,mm]=txt.split(":").map(Number); return guess+((h*60+m)-(hh*60+mm))*60000 }
function session(name,zone,sh,sm,eh,em,now){ let s=localToUtc(zone,sh,sm,now), e=localToUtc(zone,eh,em,now); if(e<=s)e+=86400000; return {name, active:now>=s&&now<e, utcRange:`${time(s,"UTC",false)} - ${time(e,"UTC",false)}`, wibRange:`${time(s,"Asia/Jakarta",false)} - ${time(e,"Asia/Jakarta",false)}`} }
function sessions(now){ return [session("Asian Kill Zone","Asia/Tokyo",9,0,12,0,now), session("London Judas Swing","Europe/London",7,0,8,30,now), session("London Open Kill Zone","Europe/London",8,0,12,0,now), session("New York Judas Swing","America/New_York",8,0,9,30,now), session("New York Open Kill Zone","America/New_York",8,30,11,30,now), session("Silver Bullet","America/New_York",10,0,11,0,now), session("Swing Session","America/New_York",13,30,16,0,now)] }
function curSession(now){ return sessions(now).find(x=>x.active) || {name:"Off-Session", active:false, utcRange:"-", wibRange:"-"} }

function newCandle(tick, tf) { let s=TF[tf], t=Math.floor(tick.time/s)*s; return {time:t, timeframe:tf, open:tick.price, high:tick.price, low:tick.price, close:tick.price, tickCount:1, isClosed:false} }
function build(prev, tick) { let cur={...prev}, closed=[]; Object.keys(TF).forEach(tf=>{ let t=Math.floor(tick.time/TF[tf])*TF[tf], c=cur[tf]; if(!c || c.time!==t){ if(c) closed.push({...c, isClosed:true}); cur[tf]=newCandle(tick,tf); } else cur[tf]={...c, high:Math.max(c.high,tick.price), low:Math.min(c.low,tick.price), close:tick.price, tickCount:c.tickCount+1}; }); return {cur, closed} }


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
function MtfMatrix({ data }) {
    if (!data || !data["M5"]) return null;
    let color = b => b === "BULLISH" ? "green" : b === "BEARISH" ? "red" : "yellow";
    return (
        <section className="card mtf-matrix">
            <div className="section-title"><Clock3 size={16}/> MTF Alignment Matrix</div>
            <div style={{display:"flex", gap:"10px", justifyContent:"space-between", marginTop:"10px"}}>
                {["M5", "M15", "H1"].map(t => (
                    <div key={t} style={{flex:1, textAlign:"center", padding:"10px", background:"#1a1a1a", borderRadius:"6px", border:`1px solid var(--${color(data[t])})`}}>
                       <div style={{fontSize:"12px", color:"#888"}}>{t}</div>
                       <div className={color(data[t])} style={{fontWeight:"bold", fontSize:"14px"}}>{data[t] || "WAIT"}</div>
                    </div>
                ))}
            </div>
            {data["M5"] === data["M15"] && data["M15"] === data["H1"] && data["M5"] !== "NEUTRAL" && (
                <div style={{marginTop:"10px", padding:"8px", background:"#102a10", color:"#4ade80", borderRadius:"4px", fontSize:"13px", textAlign:"center"}}>
                    🔥 Golden Alignment: Tren Kuat {data["M5"]}
                </div>
            )}
        </section>
    );
}

function defConcepts(s){return[{title:"Market Structure",status:"NONE",tf:"-",value:"Belum ada analisis"},{title:"Order Block",status:"NONE",tf:"-",value:"Belum ada OB"},{title:"Fair Value Gap",status:"NONE",tf:"-",value:"Belum ada FVG"},{title:"Liquidity",status:"NONE",tf:"-",value:"Belum ada sweep"},{title:"HTF Premium/Discount",status:"NONE",tf:"-",value:"Belum ada range"},{title:"Kill Zone",status:s.active?"ACTIVE":"WAIT",tf:"AUTO",value:s.name},{title:"Trade Setup",status:"WAIT",tf:"-",value:"Klik analisis"}]}
function Metric({v,l,c="yellow"}){return <div className="metric card"><div className={c}>{v}</div><span>{l}</span></div>}
function Title({icon,text}){return <div className="section-title">{icon}<span>{text}</span></div>}
function Row({r}){return <div className="session-row"><div><strong className={r.active?"green":""}>{r.name}</strong><span>WIB: {r.wibRange}</span></div><em>{r.utcRange}</em></div>}
function Concept({x}){return <div className="concept"><div className={`status ${x.status.toLowerCase()}`}>{x.status}</div><strong>{x.title}</strong><span>{x.tf}</span><p>{x.value}</p></div>}
function Result({x}){return <div className="result"><div className={`bias ${x.bias.toLowerCase()}`}>{x.bias} • {x.confidence}%</div><p>{x.summary}</p><div className="setup"><strong>Setup: {x.setup.status}</strong><span>Entry: {x.setup.entry}</span><span>TP1: {p2(x.setup.tp1)}</span><span>TP2: {p2(x.setup.tp2)}</span><span>STOP: {p2(x.setup.stop)}</span></div></div>}
function Trade({t}){return <div className="trade"><strong className={t.result==="WIN"?"green":"red"}>{t.type} • {t.result}</strong><span>Entry {p2(t.entry)}</span><span>TP {p2(t.tp)} • STOP {p2(t.stop)}</span></div>}
function Nav({a,f,i,l}){return <button className={a?"nav-btn active":"nav-btn"} onClick={f}>{i}<span>{l}</span></button>}

export default function App() {
  let [tab, setTab] = useState("Dashboard");
  let [mtfData, setMtfData] = useState({});
  let [voiceAlert, setVoiceAlert] = useState(localStorage.getItem("voice_alert") !== "false");

  let [key, setKey] = useState(localStorage.getItem("twelve_api_key") || "");

  let [connStatus, setConnStatus] = useState("Offline");
  let [price, setPrice] = useState(Number(localStorage.getItem("last_price")) || 0);
  let [now, setNow] = useState(Date.now());
  let [tf, setTf] = useState("M5");
  let [logs, setLogs] = useState(JSON.parse(localStorage.getItem("logs") || "[]"));
  let [analyses, setAnalyses] = useState(JSON.parse(localStorage.getItem("analyses") || "[]"));
  let [trades, setTrades] = useState(JSON.parse(localStorage.getItem("trades") || "[]"));
  let [candles, setCandles] = useState(JSON.parse(localStorage.getItem("candles") || "{}"));
  let [current, setCurrent] = useState({});

  let ws = useRef(null);
  let watch = useRef(null);
  let reconnectTimer = useRef(null);
  let retryCount = useRef(0);
  let emittedKeys = useRef(new Set());
  
  let ses = useMemo(() => curSession(now), [now]);
  let rows = useMemo(() => sessions(now), [now]);

  useEffect(() => {
    let id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => localStorage.setItem("logs", JSON.stringify(logs.slice(0, 200))), [logs]);
  useEffect(() => localStorage.setItem("analyses", JSON.stringify(analyses.slice(0, 50))), [analyses]);
  useEffect(() => localStorage.setItem("trades", JSON.stringify(trades.slice(0, 50))), [trades]);
  useEffect(() => localStorage.setItem("candles", JSON.stringify(candles)), [candles]);

  function log(x) {
    setLogs(p => [`[${time(Date.now(), "Asia/Jakarta", false)}] ${x}`, ...p].slice(0, 200));
  }



  function scheduleReconnect() {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    let delays = [2000, 5000, 10000, 30000];
    let delay = delays[Math.min(retryCount.current, delays.length - 1)];
    setConnStatus("Reconnecting");
    log(`WebSocket disconnected. Reconnecting in ${delay / 1000}s...`);
    reconnectTimer.current = setTimeout(() => {
      retryCount.current++;
      connect();
    }, delay);
  }

  function connect() {
    if (!key.trim()) return log("Masukkan Twelve Data API Key dulu.");
    localStorage.setItem("twelve_api_key", key.trim());

    
    if (ws.current) { ws.current.onclose = null; ws.current.close(); }
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    setConnStatus("Reconnecting");
    let w = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(key.trim())}`);
    ws.current = w;

    w.onopen = () => {
      setConnStatus("Connected");
      retryCount.current = 0;
      log("WebSocket XAU/USD Connected.");
      w.send(JSON.stringify({ action: "subscribe", params: { symbols: "XAU/USD" } }));
      fetchHistoryAndScan();
    };

  async function fetchHistoryAndScan() {
    try {
      log("Memulihkan riwayat market dari background...");
      let [m5, m15, h1] = await Promise.all([fetchTf("5min").catch(()=>[]), fetchTf("15min").catch(()=>[]), fetchTf("1h").catch(()=>[])]);
      setCandles(old => ({ ...old, "M5": m5, "M15": m15, "H1": h1 }));
      if (!m5.length || !m15.length) return;
      let evs = [...scanEvents("M5", m5, m5[m5.length-1].close), ...scanEvents("M15", m15, m15[m15.length-1].close)];
      evs.sort((a,b)=>b.p - a.p).slice(0, 10).forEach(ev => {
        if (!emittedKeys.current.has(ev.key)) {
          emittedKeys.current.add(ev.key);
          log(ev.t);
        }
      });
      log("Riwayat market berhasil dipulihkan.");
    } catch(e){}
  }

    w.onmessage = e => {
      let d = JSON.parse(e.data);
      if (d.event === "subscribe-status") return;
      let p = Number(d.price), ts = Number(d.timestamp) || Math.floor(Date.now() / 1000);
      if (!p || p < 1000 || p > 10000) return;
      setPrice(p);
      localStorage.setItem("last_price", String(p));
      processTick({ price: p, time: ts });
      checkSetup(p);
    };

    w.onclose = () => { setConnStatus("Offline"); scheduleReconnect(); };
    w.onerror = () => log("WebSocket error.");
  }

  useEffect(() => {
    const handleOnline = () => { log("Internet terhubung kembali. Mencoba reconnect..."); retryCount.current = 0; if (key.trim()) connect(); };
    const handleVisibility = () => { if (document.visibilityState === 'visible' && ws.current?.readyState !== WebSocket.OPEN) { log("Aplikasi dibuka kembali. Mengecek koneksi..."); retryCount.current = 0; if (key.trim()) connect(); } };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    if (key.trim() && (!ws.current || ws.current.readyState !== WebSocket.OPEN)) connect();
    return () => { window.removeEventListener('online', handleOnline); document.removeEventListener('visibilitychange', handleVisibility); if (ws.current) { ws.current.onclose = null; ws.current.close(); } if (reconnectTimer.current) clearTimeout(reconnectTimer.current); };
  }, [key]);

  function processTick(tick) {

    let lastScan = window.lastScanTime || 0;
    let nowMs = Date.now();
    let shouldScan = (nowMs - lastScan) > 2000;
    if (shouldScan) window.lastScanTime = nowMs;

    setCurrent(prev => {
      let b = build(prev, tick);
      
      if (shouldScan) {
        setTimeout(() => {
          let tfs = ["M5", "M15", "H1"];
          let newMtf = {};
          tfs.forEach(ctf => {
            let list = candles[ctf] || [];
            let activeList = b.cur[ctf] ? [...list, b.cur[ctf]] : list;
            if (activeList.length < 8) return;
            
            if (activeList.length >= 60) {
               let r = analyze(activeList, [], ctf, curSession(Date.now()), tick.price);
               newMtf[ctf] = r.bias;
            }

            let events = scanEvents(ctf, activeList, tick.price);
            events.forEach(ev => {
              if (!emittedKeys.current.has(ev.key)) {
                emittedKeys.current.add(ev.key);
                log(ev.t);
                if (voiceAlert && window.speechSynthesis && ev.p >= 65) {
                    let tts = new SpeechSynthesisUtterance(`Sinyal ${ev.t.includes("Bullish") ? "Bullish" : "Bearish"} pada ${ctf}`);
                    tts.lang = "id-ID";
                    window.speechSynthesis.speak(tts);
                    if(window.Android && window.Android.showNotification) {
                        window.Android.showNotification("XAUUSD Alert", `Sinyal ${ev.t.includes("Bullish") ? "Bullish" : "Bearish"} terdeteksi pada ${ctf}`);
                    }
                }
              }
            });
          });
          if(Object.keys(newMtf).length > 0) setMtfData(old => ({...old, ...newMtf}));
          if (emittedKeys.current.size > 1000) emittedKeys.current.clear();
        }, 0);
      }

      if (b.closed.length) {
        setCandles(old => {
          let n = { ...old };
          b.closed.forEach(c => {
            n[c.timeframe] = [...(n[c.timeframe] || []), c].slice(-500);
            if (c.timeframe !== "M1") log(`${c.timeframe} closed. C:${p2(c.close)}`);
          });
          return n;
        });
      }
      return b.cur;
    });
  }
  async function fetchTf(interval) {
    let url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=200&apikey=${encodeURIComponent(key.trim())}`;
    let res = await fetch(url);
    let data = await res.json();
    if (!data || data.status === "error") throw new Error(data?.message || "Gagal mengambil data");
    return (data.values || []).reverse().map(c => ({ time: new Date(c.datetime).getTime(), timeframe: interval, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), tickCount: 1, isClosed: true }));
  }

  async function runAnalysis() {
    if (!key.trim()) return log("Error: API Key kosong. Masukkan di tab Settings.");
    if (ws.current?.readyState !== WebSocket.OPEN) setConnStatus("Fallback API");

    log(`Memulai MTF fetch data ${tf} dari Twelve Data...`);
    let interval = { "M1":"1min", "M5":"5min", "M15":"15min", "M30":"30min", "H1":"1h", "H4":"4h", "D1":"1day", "W1":"1week" }[tf] || "5min";
    let htfInterval = { "M1":"15min", "M5":"1h", "M15":"4h", "M30":"1day", "H1":"1day", "H4":"1week" }[tf] || "1day";

    try {
      let [ltfData, htfData] = await Promise.all([
        fetchTf(interval),
        fetchTf(htfInterval).catch(() => [])
      ]);
      
      setCandles(old => ({ ...old, [tf]: ltfData, [htfInterval]: htfData }));
      
      let list = ltfData;
      let active = current[tf] ? [...list, current[tf]] : list;
      let resObj = analyze(active, htfData, tf, ses.name, price || active[active.length - 1].close);
      
      let entry = { id: Date.now(), date: new Date().toISOString(), timeframe: tf, session: ses.name, price: price || active[active.length - 1].close, ...resObj };
      setAnalyses(p => [entry, ...p].slice(0, 50));
      log(`MTF Analysis saved. Bias ${resObj.bias} ${resObj.confidence}%`);
      
      if (resObj.setup.status === "ACTIVE") {
        watch.current = resObj.setup;
        let msg = `🔥 <b>SETUP ACTIVE [${tf}]</b> 🔥

Bias: ${resObj.bias}
Entry: ${resObj.setup.entry}
TP1: ${p2(resObj.setup.tp1)}
TP2: ${p2(resObj.setup.tp2)}
SL: ${p2(resObj.setup.stop)}
Session: ${ses.name}`;
        log(msg.replace(/<[^>]*>?/gm, ''));
      } else {
        log("SETUP WAIT: tunggu kondisi valid.");
      }
    } catch (err) { log("Error Analisa: " + err.message); }
  }

  function checkSetup(p) {
    let s = watch.current, a = analyses[0];
    if (!s || !a) return;
    let buy = a.bias === "BULLISH";
    if (!s.tp1Done && ((buy && p >= s.tp1) || (!buy && p <= s.tp1))) {
      s.tp1Done = true;
      let msg = `✅ <b>TP1 TERCAPAI</b>
Pair: XAU/USD
Harga: ${p2(p)}`;
      log(msg.replace(/<[^>]*>?/gm, ''));
    }
    let win = (buy && p >= s.tp2) || (!buy && p <= s.tp2), loss = (buy && p <= s.stop) || (!buy && p >= s.stop);
    if (win || loss) {
      let type = win ? "TP2" : "STOP";
      let msg = `${win ? '🚀' : '❌'} <b>${type} TERCAPAI</b>
Pair: XAU/USD
Harga: ${p2(p)}`;
      log(msg.replace(/<[^>]*>?/gm, ''));
      setTrades(t => [{ id: Date.now(), type: buy ? "BUY" : "SELL", result: win ? "WIN" : "LOSS", entry: price, tp: s.tp2, stop: s.stop, timestamp: Date.now() }, ...t]);
      watch.current = null;
    }
  }

  function downloadPdf() {
    if (typeof window.html2pdf === 'undefined') { log("PDF engine loading, try again."); return; }
    let wins = trades.filter(t=>t.result==="WIN").length;
    let losses = trades.filter(t=>t.result==="LOSS").length;
    let winrate = trades.length ? (wins/trades.length*100).toFixed(1) : 0;
    
    let el = document.createElement("div");
    el.innerHTML = `
      <div style="padding:40px;font-family:sans-serif;color:#000;">
        <h1 style="border-bottom:2px solid #ccc;padding-bottom:10px;">Trading Performance Report</h1>
        <p style="color:#555;">Generated by XAUUSD ICT PWA</p>
        <h3 style="margin-top:30px;">Summary Statistics</h3>
        <ul style="line-height:1.8;font-size:16px;">
          <li>Total Trades: <b>${trades.length}</b></li>
          <li>Winning Trades: <b>${wins}</b></li>
          <li>Losing Trades: <b>${losses}</b></li>
          <li>Win/Loss Ratio: <b>${winrate}%</b></li>
        </ul>
        <h3 style="margin-top:30px;">Latest Trades</h3>
        <table style="width:100%;border-collapse:collapse;text-align:left;">
          <tr style="border-bottom:1px solid #000;"><th>Date</th><th>Type</th><th>Result</th><th>Entry</th></tr>
          ${trades.slice(0, 15).map(t => `<tr style="border-bottom:1px solid #ddd;"><td>${dtext(t.timestamp)}</td><td>${t.type}</td><td>${t.result}</td><td>${p2(t.entry)}</td></tr>`).join('')}
        </table>
      </div>
    `;
    window.html2pdf().from(el).save(`Trading_Report_${Date.now()}.pdf`);
  }

  function handleSaveConnect() {
    let btn = document.getElementById("btn-save-connect");
    if(btn) btn.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5"/></svg> Menyimpan...</span>';
    setTimeout(() => {
        connect();
        if(btn) btn.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg> Terhubung!</span>';
        setTimeout(() => {
            if(btn) btn.innerHTML = '<span style="display:flex;align-items:center;gap:6px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5"/></svg> Save & Connect</span>';
        }, 3000);
    }, 500);
  }

  let latest = analyses[0];
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-mark">XAU</div>
        <div>
          <div className="brand-title">XAUUSD ICT</div>
          <div className="brand-sub">PWA • MTF & Event Scanner</div>
        </div>
        <div className={connStatus === "Connected" ? "live-dot on" : connStatus === "Fallback API" ? "live-dot fallback" : connStatus === "Reconnecting" ? "live-dot yellow" : "live-dot"}>
          {connStatus}
        </div>
      </header>
      <main className="content">
        {tab === "Dashboard" && (
          <>
            <section className="hero card">
              <div>
                <div className="kicker">INNER CIRCLE TRADER</div>
                <h1>XAU<span>/</span>USD</h1>
                <div className="label">WIB Time</div>
                <div className="clock">{time(now)}</div>
                <div className="muted">{dtext(now)}</div>
              </div>
              <div className="price-box">
                <div className="label">Gold Price</div>
                <div className="price">{money(price)}</div>
                <div className={connStatus === "Connected" ? "green" : "muted"}>Real-time XAU/USD</div>
                <div className={ses.active ? "green small" : "muted small"}>{ses.name}</div>
              </div>
            </section>
            <MtfMatrix data={mtfData} />
            <div className="metrics">
              <Metric v={analyses.length} l="Analyses" />
              <Metric v={analyses.filter(a => a.bias === "BULLISH").length} l="Bullish" c="green" />
              <Metric v={analyses.filter(a => a.bias === "BEARISH").length} l="Bearish" c="red" />
            </div>
            <button className="action" onClick={() => setTab("Analyze")}>
              <Zap size={18} /> Analisis ICT MTF
            </button>
            <section className="card">
              <Title icon={<Clock3 size={16} />} text="Trading Sessions Auto DST" />
              {rows.map(r => <Row key={r.name} r={r} />)}
            </section>
            <section className="card">
              <Title icon={<Radio size={16} />} text="ICT Concepts Covered" />
              <div className="concept-grid">
                {(latest?.concepts || defConcepts(ses)).map(c => <Concept key={c.title} x={c} />)}
              </div>
            </section>
          </>
        )}
        {tab === "Analyze" && (
          <section className="card">
            <div className="page-title">Analisis MTF ICT</div>
            <div className="muted">Session otomatis: {ses.name}</div>
            <div className="tf-row">
              {Object.keys(TF).map(x => (
                <button key={x} onClick={() => setTf(x)} className={x === tf ? "chip active" : "chip"}>
                  {x}
                </button>
              ))}
            </div>
            <button className="action" onClick={runAnalysis}>
              <Cpu size={18} /> Analisis ICT MTF Sekarang
            </button>
            {latest && <Result x={latest} />}
          </section>
        )}
        {tab === "Terminal" && (
          <section className="terminal">
            <Title icon={<Terminal size={16} />} text="Live Event Scanner" />
            {logs.map((l, i) => <div className="log" key={i}>› {l}</div>)}
          </section>
        )}
        {tab === "History" && (
          <section className="card">
            <div className="page-title">History Trade</div>
            <button className="action" onClick={downloadPdf} style={{margin:"10px 0", background:"#3b82f6", color:"#fff"}}>
              <Download size={18} /> Download PDF Report
            </button>
            {trades.length ? trades.map(t => <Trade key={t.id} t={t} />) : <div className="muted">Belum ada trade selesai.</div>}
          </section>
        )}
        {tab === "Settings" && (
          <section className="card">
            <div className="page-title">Settings & API</div>
            <div className="label">Twelve Data API Key</div>
            <input value={key} onChange={e => setKey(e.target.value)} placeholder="Twelve Data API key" />


            <button id="btn-save-connect" className="action" onClick={handleSaveConnect}>
              <span style={{display:"flex", alignItems:"center", gap:"6px"}}><KeyRound size={18} /> Save & Connect</span>
            </button>
                        <p className="muted">API key disimpan aman di localStorage HP Anda.</p>
            <div style={{marginTop:"20px"}} className="label">Voice Alerts (Text-to-Speech)</div>
            <button className={voiceAlert ? "action" : "chip"} onClick={() => { setVoiceAlert(!voiceAlert); localStorage.setItem("voice_alert", !voiceAlert); }}>
              {voiceAlert ? "🔊 Voice Alerts ON" : "🔇 Voice Alerts OFF"}
            </button>
            <p className="muted">Aktifkan untuk mendengarkan robot suara membacakan sinyal saat aplikasi berjalan.</p>
          </section>
        )}
      </main>
      <nav className="nav">
        <Nav a={tab === "Dashboard"} f={() => setTab("Dashboard")} i={<BarChart3 size={18} />} l="Dashboard" />
        <Nav a={tab === "Analyze"} f={() => setTab("Analyze")} i={<Activity size={18} />} l="Analyze" />
        <Nav a={tab === "History"} f={() => setTab("History")} i={<History size={18} />} l="History" />
        <Nav a={tab === "Terminal"} f={() => setTab("Terminal")} i={<Terminal size={18} />} l="Terminal" />
        <Nav a={tab === "Settings"} f={() => setTab("Settings")} i={<Settings size={18} />} l="Settings" />
      </nav>
    </div>
  );
}
