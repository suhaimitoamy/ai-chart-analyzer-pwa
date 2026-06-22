import sys

with open("src/App.jsx", "r") as f:
    lines = f.readlines()

new_lines = []
in_process_tick = False
skip = False

for line in lines:
    if "function processTick(tick) {" in line:
        in_process_tick = True
        new_lines.append(line)
        new_lines.append("""
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
                if (ev.p >= 90) sendTele(`🚨 <b>Market Scanner</b>\\n${ev.t}\\nTime: ${time(Date.now())}`);
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
""")
        skip = True
    elif in_process_tick and skip:
        if "async function fetchTf(" in line:
            in_process_tick = False
            skip = False
            new_lines.append(line)
    else:
        new_lines.append(line)

with open("src/App.jsx", "w") as f:
    f.writelines(new_lines)

