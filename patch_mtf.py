import re

with open('src/App.jsx', 'r') as f:
    content = f.read()

# 1. Add states
state_insert = """  let [mtfData, setMtfData] = useState({});
  let [voiceAlert, setVoiceAlert] = useState(localStorage.getItem("voice_alert") !== "false");
"""
content = re.sub(r'(let \[tab, setTab\] = useState\("Dashboard"\);)', r'\1\n' + state_insert, content)

# 2. Add MTF Matrix Component
mtf_comp = """function MtfMatrix({ data }) {
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

function defConcepts"""
content = content.replace('function defConcepts', mtf_comp)


# 3. Update fetchHistoryAndScan
old_fetch = """  async function fetchHistoryAndScan() {
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
  }"""

new_fetch = """  async function fetchHistoryAndScan() {
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
  }"""
content = content.replace(old_fetch, new_fetch)

# 4. Update processTick
old_scan = """          let tfs = ["M1", "M5", "M15", "H1"];
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
          if (emittedKeys.current.size > 1000) emittedKeys.current.clear();"""

new_scan = """          let tfs = ["M5", "M15", "H1"];
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
                }
              }
            });
          });
          if(Object.keys(newMtf).length > 0) setMtfData(old => ({...old, ...newMtf}));
          if (emittedKeys.current.size > 1000) emittedKeys.current.clear();"""
content = content.replace(old_scan, new_scan)

# 5. Add UI elements
# In Dashboard, after <section className="hero card"> ... </section>
content = content.replace('</section>\n            <div className="metrics">', '</section>\n            <MtfMatrix data={mtfData} />\n            <div className="metrics">')

# In Settings, add voice toggle
settings_ui = """            <p className="muted">API key disimpan aman di localStorage HP Anda.</p>
            <div style={{marginTop:"20px"}} className="label">Voice Alerts (Text-to-Speech)</div>
            <button className={voiceAlert ? "action" : "chip"} onClick={() => { setVoiceAlert(!voiceAlert); localStorage.setItem("voice_alert", !voiceAlert); }}>
              {voiceAlert ? "🔊 Voice Alerts ON" : "🔇 Voice Alerts OFF"}
            </button>
            <p className="muted">Aktifkan untuk mendengarkan robot suara membacakan sinyal saat aplikasi berjalan.</p>
          </section>"""
content = content.replace('<p className="muted">API key disimpan aman di localStorage HP Anda.</p>\n          </section>', settings_ui)


with open('src/App.jsx', 'w') as f:
    f.write(content)

print("Patch applied")
