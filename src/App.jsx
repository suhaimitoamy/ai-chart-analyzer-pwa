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


function processSMC(candles) {
    if (candles.length < 20) return { trend: 0, lastBreak: null, obs: [], fvgs: [], highestHigh: 0, lowestLow: 0, swingHighs: [], swingLows: [] };
    
    let highs = [], lows = [];
    let left = 5, right = 5;
    
    for (let i = left; i < candles.length - right; i++) {
        let isHigh = true, isLow = true;
        for (let j = 1; j <= left; j++) {
            if (candles[i - j].high >= candles[i].high) isHigh = false;
            if (candles[i - j].low <= candles[i].low) isLow = false;
        }
        for (let j = 1; j <= right; j++) {
            if (candles[i + j].high >= candles[i].high) isHigh = false;
            if (candles[i + j].low <= candles[i].low) isLow = false;
        }
        if (isHigh) highs.push({ ...candles[i], index: i });
        if (isLow) lows.push({ ...candles[i], index: i });
    }

    let trend = 0; // 1 = Bullish, -1 = Bearish
    let activeObs = [];
    let activeFvgs = [];
    let lastBreak = null;
    let currentSwingHigh = null;
    let currentSwingLow = null;
    
    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        
        let foundHigh = highs.find(h => h.index === i - right);
        if (foundHigh) currentSwingHigh = foundHigh;
        let foundLow = lows.find(l => l.index === i - right);
        if (foundLow) currentSwingLow = foundLow;

        // Fair Value Gaps
        if (i >= 2) {
            let leftC = candles[i - 2], rightC = candles[i];
            let atr = Math.abs(candles[i-1].high - candles[i-1].low) * 0.1; // Filter micro gaps
            if (leftC.high < rightC.low - atr) activeFvgs.push({ type: "BULLISH", top: rightC.low, bottom: leftC.high, mitigated: false, index: i });
            if (leftC.low > rightC.high + atr) activeFvgs.push({ type: "BEARISH", top: leftC.low, bottom: rightC.high, mitigated: false, index: i });
        }
        
        // Mitigate FVG
        for (let fvg of activeFvgs) {
            if (!fvg.mitigated && i > fvg.index) {
                if (fvg.type === "BULLISH" && c.low <= fvg.top) fvg.mitigated = true;
                if (fvg.type === "BEARISH" && c.high >= fvg.bottom) fvg.mitigated = true;
            }
        }

        // Structure Break (BOS / CHoCH)
        if (currentSwingHigh && c.close > currentSwingHigh.high) {
            let isChoch = trend === -1 || trend === 0;
            trend = 1;
            lastBreak = { type: isChoch ? "CHOCH" : "BOS", dir: "BULLISH", price: currentSwingHigh.high, index: i, time: c.time };
            
            // Bullish OB
            let startIdx = currentSwingLow ? currentSwingLow.index : 0;
            let leg = candles.slice(startIdx, i);
            let minC = leg.reduce((min, cur) => cur.low < min.low ? cur : min, leg[0]);
            if (minC) activeObs.push({ type: "BULLISH", top: Math.max(minC.open, minC.close), bottom: minC.low, mitigated: false, index: minC.index });
            
            currentSwingHigh = null; 
        }

        if (currentSwingLow && c.close < currentSwingLow.low) {
            let isChoch = trend === 1 || trend === 0;
            trend = -1;
            lastBreak = { type: isChoch ? "CHOCH" : "BOS", dir: "BEARISH", price: currentSwingLow.low, index: i, time: c.time };
            
            // Bearish OB
            let startIdx = currentSwingHigh ? currentSwingHigh.index : 0;
            let leg = candles.slice(startIdx, i);
            let maxC = leg.reduce((max, cur) => cur.high > max.high ? cur : max, leg[0]);
            if (maxC) activeObs.push({ type: "BEARISH", top: maxC.high, bottom: Math.min(maxC.open, maxC.close), mitigated: false, index: maxC.index });
            
            currentSwingLow = null;
        }

        // Mitigate OB
        for (let ob of activeObs) {
            if (!ob.mitigated && i > ob.index) {
                if (ob.type === "BULLISH" && c.low < ob.bottom) ob.mitigated = true;
                if (ob.type === "BEARISH" && c.high > ob.top) ob.mitigated = true;
            }
        }
    }

    let lastBreakIdx = lastBreak ? lastBreak.index : 0;
    let currentLeg = candles.slice(lastBreakIdx);
    let highestHigh = currentLeg.length ? Math.max(...currentLeg.map(c => c.high)) : candles[candles.length - 1].high;
    let lowestLow = currentLeg.length ? Math.min(...currentLeg.map(c => c.low)) : candles[candles.length - 1].low;

    return { 
        trend, 
        lastBreak, 
        obs: activeObs.filter(o => !o.mitigated), 
        fvgs: activeFvgs.filter(f => !f.mitigated), 
        highestHigh, 
        lowestLow, 
        swingHighs: highs, 
        swingLows: lows 
    };
}

function calculateConfidence(bias, choppy, hasSweep, hasFvg, hasOb) {
    let score = bias === "NEUTRAL" ? 35 : 55;
    if (hasSweep) score += 10;
    if (hasFvg) score += 10;
    if (hasOb) score += 10;
    if (choppy) score -= 15;
    return Math.max(25, Math.min(85, score));
}

function buildTradeSetup(bias, currentPrice, currentZone, nearestSupport, nearestResistance, high60, low60, atr, fvg, ob, liquidityStr) {
    let tradeType = "NONE";
    let entryZone = "-";
    let sl = 0;
    let tp1 = 0;
    let tp2 = 0;
    let statusText = "WAIT";

    if (currentZone === "PREMIUM") {
        tradeType = "SELL";
        entryZone = ob.bearish !== "-" ? ob.bearish : (fvg.bearish !== "-" ? fvg.bearish : "-");
        
        if (entryZone !== "-") {
            let topZone = parseFloat(entryZone.split(" - ")[0]) || nearestResistance; // highest point of bearish POI is the left number usually? Wait, if it's high - low. findOrderBlock uses p2(low) - p2(high). Wait, fvg is right.high - left.low. Let's extract max.
            let nums = entryZone.split(" - ").map(n => parseFloat(n));
            let maxZone = Math.max(...nums);
            
            sl = maxZone + atr;
            tp1 = nearestSupport; // TP1 is Swing Support
            tp2 = low60; // Absolute low
            
            let liquiditySwept = liquidityStr.includes("Buy-side");
            statusText = liquiditySwept ? "ACTIVE" : "WAIT (Menunggu Buy-side Sweep)";
        } else {
            statusText = "WAIT (Tidak ada Bearish POI)";
        }
    } else if (currentZone === "DISCOUNT") {
        tradeType = "BUY";
        entryZone = ob.bullish !== "-" ? ob.bullish : (fvg.bullish !== "-" ? fvg.bullish : "-");
        
        if (entryZone !== "-") {
            let nums = entryZone.split(" - ").map(n => parseFloat(n));
            let minZone = Math.min(...nums);
            
            sl = minZone - atr;
            tp1 = nearestResistance; // TP1 is Swing Resistance
            tp2 = high60; // Absolute high
            
            let liquiditySwept = liquidityStr.includes("Sell-side");
            statusText = liquiditySwept ? "ACTIVE" : "WAIT (Menunggu Sell-side Sweep)";
        } else {
             statusText = "WAIT (Tidak ada Bullish POI)";
        }
    } else {
        statusText = "WAIT (Area Equilibrium)";
    }
    
    return { status: statusText, entry: entryZone, tp1, tp2, stop: sl, tradeType };
}

function analyze(candles, htfCs, tf, session, livePrice) {
    let smc = processSMC(candles);
    if (!smc || smc.swingHighs.length === 0) return { bias: "NEUTRAL", confidence: 25, summary: "Candle belum cukup (min 20).", concepts: [], setup: { status: "WAIT", entry: "-", tp1: 0, tp2: 0, stop: 0 } };
    
    let currentPrice = livePrice || candles[candles.length - 1].close;
    
    // Premium/Discount based on recent swing leg
    let eq = (smc.highestHigh + smc.lowestLow) / 2.0;
    let currentZone = currentPrice > eq ? "PREMIUM" : currentPrice < eq ? "DISCOUNT" : "EQUILIBRIUM";
    
    let bias = smc.trend === 1 ? "BULLISH" : smc.trend === -1 ? "BEARISH" : "NEUTRAL";
    let isChoppy = candles.slice(-5).filter(c => Math.abs(c.open - c.close) / (c.high - c.low) < 0.3).length >= 3;

    let nearestSupport = [...smc.swingLows].reverse().find(s => s.low < currentPrice)?.low || smc.lowestLow;
    let nearestResistance = [...smc.swingHighs].reverse().find(s => s.high > currentPrice)?.high || smc.highestHigh;

    let fvgBullish = smc.fvgs.filter(f => f.type === "BULLISH").pop();
    let fvgBearish = smc.fvgs.filter(f => f.type === "BEARISH").pop();
    let obBullish = smc.obs.filter(o => o.type === "BULLISH").pop();
    let obBearish = smc.obs.filter(o => o.type === "BEARISH").pop();

    let fvgBullStr = fvgBullish ? `${p2(fvgBullish.bottom)} - ${p2(fvgBullish.top)}` : "-";
    let fvgBearStr = fvgBearish ? `${p2(fvgBearish.bottom)} - ${p2(fvgBearish.top)}` : "-";
    let obBullStr = obBullish ? `${p2(obBullish.bottom)} - ${p2(obBullish.top)}` : "-";
    let obBearStr = obBearish ? `${p2(obBearish.bottom)} - ${p2(obBearish.top)}` : "-";

    let latest = candles[candles.length - 1];
    let sweptLows = smc.swingLows.filter(s => latest.low < s.low && latest.close > s.low);
    let sweptHighs = smc.swingHighs.filter(s => latest.high > s.high && latest.close < s.high);
    let hasSweep = sweptLows.length > 0 || sweptHighs.length > 0;
    let liquidityStr = sweptLows.length ? `Sell-side swept at ${p2(sweptLows[0].low)}` : 
                       sweptHighs.length ? `Buy-side swept at ${p2(sweptHighs[0].high)}` : 
                       "No fresh sweep";

    let confidence = calculateConfidence(bias, isChoppy, hasSweep, fvgBullish || fvgBearish, obBullish || obBearish);

    let atr = Math.max((smc.highestHigh - smc.lowestLow) * 0.1, 1.0); 
    let tradeType = "NONE", entryZone = "-", sl = 0, tp1 = 0, tp2 = 0, statusText = "WAIT";

    if (currentZone === "PREMIUM" && bias !== "BULLISH") {
        tradeType = "SELL";
        entryZone = obBearish ? obBearStr : (fvgBearish ? fvgBearStr : "-");
        if (entryZone !== "-") {
            let maxZone = Math.max(...entryZone.split(" - ").map(n => parseFloat(n)));
            sl = maxZone + atr;
            tp1 = nearestSupport;
            tp2 = smc.lowestLow;
            statusText = sweptHighs.length ? "ACTIVE" : "WAIT (Menunggu Buy-side Sweep)";
        } else statusText = "WAIT (Tidak ada Bearish POI)";
    } else if (currentZone === "DISCOUNT" && bias !== "BEARISH") {
        tradeType = "BUY";
        entryZone = obBullish ? obBullStr : (fvgBullish ? fvgBullStr : "-");
        if (entryZone !== "-") {
            let minZone = Math.min(...entryZone.split(" - ").map(n => parseFloat(n)));
            sl = minZone - atr;
            tp1 = nearestResistance;
            tp2 = smc.highestHigh;
            statusText = sweptLows.length ? "ACTIVE" : "WAIT (Menunggu Sell-side Sweep)";
        } else statusText = "WAIT (Tidak ada Bullish POI)";
    } else {
        statusText = "WAIT (Area EQ / Melawan Bias)";
    }

    let setup = { status: statusText, entry: entryZone, tp1, tp2, stop: sl, tradeType };
    let zoneText = currentZone === "PREMIUM" ? "premium" : currentZone === "DISCOUNT" ? "diskon" : "equilibrium";
    let summary = bias === "BULLISH" ? `Market dalam bias bullish. Harga di zona ${zoneText}, resistance terdekat ${p2(nearestResistance)}.` :
                 bias === "BEARISH" ? `Market dalam bias bearish. Harga di zona ${zoneText}, support terdekat ${p2(nearestSupport)}.` :
                 `Market dalam bias netral. Harga di zona ${zoneText}.`;

    let concept = (title, status, tf_label, value) => ({ title, status, tf: tf_label, value });
    
    return {
        bias,
        confidence,
        summary,
        setup,
        concepts: [
            concept("Market Structure", smc.lastBreak ? "ACTIVE" : "WAIT", tf, smc.lastBreak ? `${smc.lastBreak.type} ${smc.lastBreak.dir} at ${p2(smc.lastBreak.price)}` : "Belum ada Break"),
            concept("Order Block", (bias==="BULLISH" && obBullish)||(bias==="BEARISH" && obBearish) ? "ACTIVE" : "CONTEXT", tf, `Bull: ${obBullStr} | Bear: ${obBearStr}`),
            concept("Fair Value Gap", (bias==="BULLISH" && fvgBullish)||(bias==="BEARISH" && fvgBearish) ? "ACTIVE" : "CONTEXT", tf, `Bull: ${fvgBullStr} | Bear: ${fvgBearStr}`),
            concept("Liquidity", hasSweep ? "ACTIVE" : "WAIT", tf, liquidityStr),
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
                    <div key={t} style={{flex:1, textAlign:"center", padding:"10px", background:"#1e1e1e", borderRadius:"6px", border:`1px solid var(--${color(data[t])})`}}>
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
function Result({x}){
  let cColor = x.bias === "BULLISH" ? "#4ade80" : x.bias === "BEARISH" ? "#ff5252" : "#d4af37";
  let bgGlow = x.bias === "BULLISH" ? "rgba(74, 222, 128, 0.1)" : x.bias === "BEARISH" ? "rgba(255, 82, 82, 0.1)" : "rgba(212, 175, 55, 0.1)";
  return (
    <div style={{ marginTop: "20px", border: `1px solid ${cColor}`, background: bgGlow, borderRadius: "16px", padding: "20px", position: "relative", overflow: "hidden", boxShadow: `0 0 20px ${bgGlow}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
         <h3 style={{ margin: 0, color: cColor, fontSize: "20px", fontWeight: 800 }}>{x.bias}</h3>
         <div style={{ background: cColor, color: "#000", padding: "4px 12px", borderRadius: "20px", fontWeight: "bold", fontSize: "14px" }}>Confidence: {x.confidence}%</div>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.6", marginBottom: "20px" }}>{x.summary}</p>
      
      <div style={{ background: "rgba(10,10,10,0.6)", borderRadius: "12px", padding: "15px", border: "1px solid rgba(255,255,255,0.05)" }} className={x.setup.status === "ACTIVE" ? "pulse-gold slide-up" : "slide-up"}>
         <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "10px", marginBottom: "10px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>Status Setup</span>
            <span style={{ fontWeight: "bold", color: x.setup.status === "ACTIVE" ? "#d4af37" : "#888" }}>{x.setup.tradeType && x.setup.tradeType !== "NONE" ? `[${x.setup.tradeType}] ` : ""}{x.setup.status}</span>
         </div>
         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
               <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Entry Zone</span>
               <span style={{ fontWeight: "bold", fontSize: "14px" }}>{x.setup.entry}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "right" }}>
               <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Stop Loss</span>
               <span style={{ fontWeight: "bold", color: "#ff5252", fontSize: "14px" }}>{p2(x.setup.stop)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "5px" }}>
               <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Take Profit 1</span>
               <span style={{ fontWeight: "bold", color: "#4ade80", fontSize: "14px" }}>{p2(x.setup.tp1)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "5px", textAlign: "right" }}>
               <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Take Profit 2</span>
               <span style={{ fontWeight: "bold", color: "#4ade80", fontSize: "14px" }}>{p2(x.setup.tp2)}</span>
            </div>
         </div>
      </div>

      {x.setup.status === "ACTIVE" && (
          <button onClick={() => saveToJournal(x.setup, x.summary)} style={{ marginTop: "15px", width: "100%", padding: "12px", background: "var(--primary-gold)", color: "#000", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
             📝 Simpan ke Jurnal Trading
          </button>
      )}
    </div>
  );
}
function Trade({t}){return <div className="trade"><strong className={t.result==="WIN"?"green":"red"}>{t.type} • {t.result}</strong><span>Entry {p2(t.entry)}</span><span>TP {p2(t.tp)} • STOP {p2(t.stop)}</span></div>}
function Nav({a,f,i,l}){return <button className={a?"nav-btn active":"nav-btn"} onClick={f}>{i}<span>{l}</span></button>}

function saveToJournal(setup, summary) {
  let journal = {
      id: "ai_" + Date.now().toString(),
      date: new Date().toISOString().slice(0, 10),
      title: "Setup AI: " + (setup.tradeType || "SMC"),
      market: "XAUUSD",
      setup: `Entry: ${setup.entry}\nSL: ${setup.stop}\nTP1: ${setup.tp1}\nTP2: ${setup.tp2}`,
      result: "Belum selesai",
      evaluation: summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
  };
  try {
      let journals = JSON.parse(localStorage.getItem("tradingLibraryManager.journals.v1") || "[]");
      journals.unshift(journal);
      localStorage.setItem("tradingLibraryManager.journals.v1", JSON.stringify(journals));
      if(window.showToast) window.showToast("✅ Berhasil disimpan ke Jurnal Trading Amy FX!"); else alert("✅ Berhasil disimpan");
  } catch(e) {
      if(window.showToast) window.showToast("Gagal: " + e.message); else alert("Gagal menyimpan ke jurnal: " + e.message);
  }
}

export default function App() {
  let [tab, setTab] = useState("Dashboard");
  let [isAnalyzing, setIsAnalyzing] = useState(false);
  let [loadingText, setLoadingText] = useState("Menganalisis Algoritma...");
  let [mtfData, setMtfData] = useState({});
  let [voiceAlert, setVoiceAlert] = useState(localStorage.getItem("voice_alert") !== "false");
  let [bgScanner, setBgScanner] = useState(localStorage.getItem("bg_scanner") === "true");

  useEffect(() => {
    if (window.Android) {
      if (bgScanner && window.Android.startBackgroundScanner) {
        window.Android.startBackgroundScanner();
      } else if (!bgScanner && window.Android.stopBackgroundScanner) {
        window.Android.stopBackgroundScanner();
      }
    }
  }, [bgScanner]);

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
    setIsAnalyzing(true);
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
    setIsAnalyzing(false);
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
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <section className="hero card" style={{ textAlign: "center", padding: "30px 20px" }}>
               <div className="kicker">SMART MONEY ENGINE</div>
               <h1 style={{ fontSize: "28px", margin: "10px 0", color: "var(--primary-gold)", textShadow: "0 0 20px rgba(212,175,55,0.3)" }}>AI Analyzer</h1>
               <p style={{ color: "var(--text-muted)", fontSize: "14px", maxWidth: "250px", margin: "0 auto" }}>Pilih timeframe untuk memindai struktur, FVG, dan likuiditas secara instan.</p>
               <div style={{ marginTop: "15px", display: "inline-block", background: "rgba(20,20,20,0.8)", padding: "6px 12px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)", fontSize: "12px", color: "var(--primary-gold)" }}>📍 {ses.name}</div>
            </section>
            
            <section className="card">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "20px" }}>
                {Object.keys(TF).map(x => (
                  <button key={x} onClick={() => setTf(x)} style={{ background: x === tf ? "var(--primary-gold)" : "rgba(255,255,255,0.03)", color: x === tf ? "#000" : "var(--text-main)", border: x === tf ? "none" : "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "12px 0", fontWeight: "bold", transition: "all 0.2s" }}>
                    {x}
                  </button>
                ))}
              </div>
              <button className="action" onClick={isAnalyzing ? null : runAnalysis} disabled={isAnalyzing} style={{ height: "55px", fontSize: "16px", letterSpacing: "1px", opacity: isAnalyzing ? 0.7 : 1, cursor: isAnalyzing ? "wait" : "pointer" }}>
                {isAnalyzing ? "⚙️ Memindai Market..." : <><Cpu size={20} /> Jalankan Analisis Algoritma ({tf})</>}
              </button>
              {latest && <Result x={latest} />}
            </section>
          </div>
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
            <div style={{marginTop:"20px"}} className="label">Background Scanner (24/7)</div>
            <button className={bgScanner ? "action" : "chip"} onClick={() => { setBgScanner(!bgScanner); localStorage.setItem("bg_scanner", !bgScanner); }}>
              {bgScanner ? "🔋 Background Scanner ON" : "🪫 Background Scanner OFF"}
            </button>
            <p className="muted">Aktifkan agar AI tetap memindai XAU/USD dan mengirim notifikasi saat layar terkunci.</p>
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
