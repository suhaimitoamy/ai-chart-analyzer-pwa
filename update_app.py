import sys

with open("src/App.jsx", "r") as f:
    lines = f.readlines()

replacement = """export default function App() {
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
  
  let ses = useMemo(() => curSession(now), [now]);
  let rows = useMemo(() => sessions(now), [now]);

  useEffect(() => {
    let id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => localStorage.setItem("logs", JSON.stringify(logs.slice(0, 120))), [logs]);
  useEffect(() => localStorage.setItem("analyses", JSON.stringify(analyses.slice(0, 50))), [analyses]);
  useEffect(() => localStorage.setItem("trades", JSON.stringify(trades.slice(0, 50))), [trades]);
  useEffect(() => localStorage.setItem("candles", JSON.stringify(candles)), [candles]);

  function log(x) {
    setLogs(p => [`[${time(Date.now(), "Asia/Jakarta", false)}] ${x}`, ...p].slice(0, 160));
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
    
    if (ws.current) {
      ws.current.onclose = null;
      ws.current.close();
    }
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    setConnStatus("Reconnecting");
    let w = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(key.trim())}`);
    ws.current = w;

    w.onopen = () => {
      setConnStatus("Connected");
      retryCount.current = 0;
      log("WebSocket XAU/USD Connected.");
      w.send(JSON.stringify({ action: "subscribe", params: { symbols: "XAU/USD" } }));
    };

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

    w.onclose = () => {
      setConnStatus("Offline");
      scheduleReconnect();
    };
    w.onerror = () => log("WebSocket error.");
  }

  useEffect(() => {
    const handleOnline = () => {
      log("Internet terhubung kembali. Mencoba reconnect...");
      retryCount.current = 0;
      if (key.trim()) connect();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && ws.current?.readyState !== WebSocket.OPEN) {
        log("Aplikasi dibuka kembali. Mengecek koneksi...");
        retryCount.current = 0;
        if (key.trim()) connect();
      }
    };
    
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    if (key.trim() && (!ws.current || ws.current.readyState !== WebSocket.OPEN)) {
      connect();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [key]);

  function processTick(tick) {
    setCurrent(prev => {
      let b = build(prev, tick);
      if (b.closed.length) {
        setCandles(old => {
          let n = { ...old };
          b.closed.forEach(c => {
            n[c.timeframe] = [...(n[c.timeframe] || []), c].slice(-500);
            if (c.timeframe !== "M1") log(`${c.timeframe} closed. C:${p2(c.close)} Ticks:${c.tickCount}`);
          });
          return n;
        });
      }
      return b.cur;
    });
  }

  async function runAnalysis() {
    if (!key.trim()) return log("Error: API Key kosong. Masukkan di tab Settings.");
    
    if (ws.current?.readyState !== WebSocket.OPEN) {
      setConnStatus("Fallback API");
    }

    log(`Memulai fetch data ${tf} dari Twelve Data...`);
    let interval = { "M1": "1min", "M5": "5min", "M15": "15min", "M30": "30min", "H1": "1h", "H4": "4h", "D1": "1day", "W1": "1week" }[tf] || "5min";
    let url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=200&apikey=${encodeURIComponent(key.trim())}`;
    
    console.log("URL request Twelve Data:", url);
    console.log("symbol:", "XAU/USD");
    console.log("interval:", interval);
    console.log("outputsize:", 200);

    try {
      let res;
      try {
        res = await fetch(url);
      } catch (e) {
        throw new Error("Koneksi gagal. Cek internet Anda.");
      }
      
      let data = await res.json();
      console.log("Response mentah dari Twelve Data:", data);
      
      if (!data || data.status === "error") {
        throw new Error(data?.message || "Gagal mengambil data dari Twelve Data");
      }
      
      const fetchedCandles = Array.isArray(data.values) ? data.values : [];
      console.log("Jumlah candle yang berhasil diparse:", fetchedCandles.length);
      
      if (fetchedCandles.length === 0) {
        throw new Error("Candle kosong.");
      }
      if (fetchedCandles.length < 50) {
        throw new Error(`Candle tidak cukup: ${fetchedCandles.length} candle`);
      }
      
      let mapped = fetchedCandles.reverse().map(c => ({
        time: new Date(c.datetime).getTime(),
        timeframe: tf,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        tickCount: 1,
        isClosed: true
      }));
      
      setCandles(old => ({ ...old, [tf]: mapped }));
      
      let list = mapped;
      let active = current[tf] ? [...list, current[tf]] : list;
      let resObj = analyze(active, tf, ses.name, price || active[active.length - 1].close);
      
      let entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        timeframe: tf,
        session: ses.name,
        price: price || active[active.length - 1].close,
        ...resObj
      };
      
      setAnalyses(p => [entry, ...p].slice(0, 50));
      log(`ICT Analysis saved. Bias ${resObj.bias} ${resObj.confidence}%`);
      
      if (resObj.setup.status === "ACTIVE") {
        watch.current = resObj.setup;
        log(`SETUP ACTIVE [${tf}] ${resObj.bias} | TP1 ${p2(resObj.setup.tp1)} | TP2 ${p2(resObj.setup.tp2)} | STOP ${p2(resObj.setup.stop)}`);
      } else {
        log("SETUP WAIT: tunggu kondisi valid.");
      }
    } catch (err) {
      console.error(err);
      log("Error Analisa: " + err.message);
    }
  }

  function checkSetup(p) {
    let s = watch.current, a = analyses[0];
    if (!s || !a) return;
    let buy = a.bias === "BULLISH";
    if (!s.tp1Done && ((buy && p >= s.tp1) || (!buy && p <= s.tp1))) {
      s.tp1Done = true;
      log(`TP1 tercapai @ ${p2(p)}`);
    }
    let win = (buy && p >= s.tp2) || (!buy && p <= s.tp2), loss = (buy && p <= s.stop) || (!buy && p >= s.stop);
    if (win || loss) {
      log(`${win ? "TP2" : "STOP"} tercapai @ ${p2(p)}`);
      setTrades(t => [{
        id: Date.now(),
        type: buy ? "BUY" : "SELL",
        result: win ? "WIN" : "LOSS",
        entry: price,
        tp: s.tp2,
        stop: s.stop,
        timestamp: Date.now()
      }, ...t]);
      watch.current = null;
    }
  }

  let latest = analyses[0];
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-mark">XAU</div>
        <div>
          <div className="brand-title">XAUUSD ICT</div>
          <div className="brand-sub">PWA • Smart Money Concepts</div>
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
              <Zap size={18} /> Analisis ICT Sekarang
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
            <div className="page-title">Analisis ICT</div>
            <div className="muted">Session otomatis: {ses.name}</div>
            <div className="tf-row">
              {Object.keys(TF).map(x => (
                <button key={x} onClick={() => setTf(x)} className={x === tf ? "chip active" : "chip"}>
                  {x}
                </button>
              ))}
            </div>
            <button className="action" onClick={runAnalysis}>
              <Cpu size={18} /> Analisis ICT Sekarang
            </button>
            {latest && <Result x={latest} />}
          </section>
        )}
        {tab === "Terminal" && (
          <section className="terminal">
            <Title icon={<Terminal size={16} />} text="Market Event Feed" />
            {logs.map((l, i) => <div className="log" key={i}>› {l}</div>)}
          </section>
        )}
        {tab === "History" && (
          <section className="card">
            <div className="page-title">History Trade</div>
            {trades.length ? trades.map(t => <Trade key={t.id} t={t} />) : <div className="muted">Belum ada trade selesai.</div>}
          </section>
        )}
        {tab === "Settings" && (
          <section className="card">
            <div className="page-title">Settings</div>
            <div className="label">Twelve Data API Key</div>
            <input value={key} onChange={e => setKey(e.target.value)} placeholder="Masukkan API key" />
            <button className="action" onClick={connect}>
              <KeyRound size={18} /> Save & Connect
            </button>
            <p className="muted">API key disimpan di localStorage device.</p>
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
"""

lines[17] = replacement + "\n"

with open("src/App.jsx", "w") as f:
    f.writelines(lines)
