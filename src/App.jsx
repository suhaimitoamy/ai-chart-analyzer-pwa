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

function atr(cs){ let a=cs.slice(-14); return a.reduce((s,c)=>s+c.high-c.low,0)/(a.length||1) || 0.5 }
function ph(cs){ let o=[]; for(let i=3;i<cs.length-1;i++) if(cs[i].high>cs[i-1].high&&cs[i].high>cs[i-2].high&&cs[i].high>cs[i-3].high&&cs[i].high>cs[i+1].high) o.push({i,level:cs[i].high}); return o }
function pl(cs){ let o=[]; for(let i=3;i<cs.length-1;i++) if(cs[i].low<cs[i-1].low&&cs[i].low<cs[i-2].low&&cs[i].low<cs[i-3].low&&cs[i].low<cs[i+1].low) o.push({i,level:cs[i].low}); return o }
function zones(cs,price){ let d=Math.max(atr(cs)*14,6), out=[], a=atr(cs); for(let i=2;i<cs.length;i++){ let x=cs[i-2], m=cs[i-1], y=cs[i], imp=Math.abs(m.close-m.open)/Math.max(m.high-m.low,.0001)>=.45||m.high-m.low>=a; if(imp&&y.low>x.high) out.push({type:"FVG",side:"bullish",low:x.high,high:y.low,status:Math.abs((x.high+y.low)/2-price)<=d?"ACTIVE":"CONTEXT"}); if(imp&&y.high<x.low) out.push({type:"FVG",side:"bearish",low:y.high,high:x.low,status:Math.abs((y.high+x.low)/2-price)<=d?"ACTIVE":"CONTEXT"}); } let r=cs.slice(-50), lo=r.reduce((a,b)=>b.low<a.low?b:a,r[0]), hi=r.reduce((a,b)=>b.high>a.high?b:a,r[0]); if(lo) out.push({type:"OB",side:"bullish",low:Math.min(lo.open,lo.close),high:Math.max(lo.open,lo.close),status:Math.abs((lo.open+lo.close)/2-price)<=d?"ACTIVE":"CONTEXT"}); if(hi) out.push({type:"OB",side:"bearish",low:Math.min(hi.open,hi.close),high:Math.max(hi.open,hi.close),status:Math.abs((hi.open+hi.close)/2-price)<=d?"ACTIVE":"CONTEXT"}); return out.sort((a,b)=>a.status===b.status?0:a.status==="ACTIVE"?-1:1) }

function analyze(cs, htfCs, tf, ses, price) {
  if (cs.length < 12) return {bias:"NEUTRAL",confidence:25,summary:"Candle belum cukup.",concepts:[],setup:{status:"WAIT",entry:"-",tp1:0,tp2:0,stop:0}};
  let h=ph(cs), l=pl(cs);
  let bsl=h.map(x=>x.level).filter(x=>x>price).sort((a,b)=>a-b)[0]||Math.max(...cs.map(c=>c.high));
  let ssl=l.map(x=>x.level).filter(x=>x<price).sort((a,b)=>b-a)[0]||Math.min(...cs.map(c=>c.low));
  
  // HTF Context
  let htfHi = htfCs && htfCs.length ? Math.max(...htfCs.slice(-40).map(c=>c.high)) : Math.max(...cs.slice(-80).map(c=>c.high));
  let htfLo = htfCs && htfCs.length ? Math.min(...htfCs.slice(-40).map(c=>c.low)) : Math.min(...cs.slice(-80).map(c=>c.low));
  let eq = (htfHi + htfLo) / 2;
  let pd = price > eq ? "PREMIUM" : price < eq ? "DISCOUNT" : "EQUILIBRIUM";

  let last = cs[cs.length-1];
  let lh = h.findLast(x=>x.i < cs.length-2), ll = l.findLast(x=>x.i < cs.length-2);
  let structure = "None";
  if(lh && last.close > lh.level) structure = `Bullish BOS @ ${p2(lh.level)}`;
  if(ll && last.close < ll.level) structure = `Bearish BOS @ ${p2(ll.level)}`;
  
  let bias = structure.includes("Bullish") ? "BULLISH" : structure.includes("Bearish") ? "BEARISH" : (last.close >= cs[Math.max(0, cs.length-4)].close ? "BULLISH" : "BEARISH");
  
  let z = zones(cs, price);
  let active = z.filter(x=>x.status==="ACTIVE");
  let valid = active.length && ((bias==="BULLISH" && pd==="DISCOUNT") || (bias==="BEARISH" && pd==="PREMIUM"));
  let a = atr(cs);
  
  let setup = valid ? (bias==="BULLISH" ? 
    {status:"ACTIVE", entry:`${p2(active[0].low)} - ${p2(active[0].high)}`, tp1:Math.max(bsl, price+a), tp2:Math.max(htfHi, price+a*2), stop:Math.min(ssl, htfLo)-a} : 
    {status:"ACTIVE", entry:`${p2(active[0].low)} - ${p2(active[0].high)}`, tp1:Math.min(ssl, price-a), tp2:Math.min(htfLo, price-a*2), stop:Math.max(bsl, htfHi)+a}) 
    : {status:"WAIT", entry:"Tunggu POI aktif + premium/discount sesuai bias", tp1:0, tp2:0, stop:0};

  let concept = (title, type) => { let x = z.find(q=>q.type===type); return {title, status: z.some(q=>q.type===type && q.status==="ACTIVE")?"ACTIVE":x?"CONTEXT":"NONE", tf, value: x ? `${x.side} ${x.status} ${p2(x.low)} - ${p2(x.high)}` : `No ${type}`}; };

  return {
    bias, 
    confidence: Math.min(90, 45 + (active.length?20:0) + (valid?20:0)), 
    summary: `Bias ${bias}. Harga di HTF ${pd}. BSL ${p2(bsl)}, SSL ${p2(ssl)}.`,
    concepts: [
      {title:"Market Structure", status: structure==="None"?"NONE":"ACTIVE", tf, value:structure},
      concept("Order Block", "OB"),
      concept("Fair Value Gap", "FVG"),
      {title:"Liquidity", status:"ACTIVE", tf, value:`BSL ${p2(bsl)} • SSL ${p2(ssl)}`},
      {title:"HTF Premium/Discount", status:"ACTIVE", tf:"HTF", value:`${pd} • EQ ${p2(eq)}`},
      {title:"Kill Zone", status:ses==="Off-Session"?"WAIT":"ACTIVE", tf:"AUTO", value:ses},
      {title:"Trade Setup", status:setup.status, tf, value:setup.entry}
    ],
    setup
  };
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
      let [m5, m15] = await Promise.all([fetchTf("5min").catch(()=>[]), fetchTf("15min").catch(()=>[])]);
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
          let tfs = ["M1", "M5", "M15", "H1"];
          tfs.forEach(ctf => {
            let list = candles[ctf] || [];
            let activeList = b.cur[ctf] ? [...list, b.cur[ctf]] : list;
            if (activeList.length < 8) return;
            let events = scanEvents(ctf, activeList, tick.price);
            events.forEach(ev => {
              if (!emittedKeys.current.has(ev.key)) {
                emittedKeys.current.add(ev.key);
                log(ev.t);
              }
            });
          });
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
