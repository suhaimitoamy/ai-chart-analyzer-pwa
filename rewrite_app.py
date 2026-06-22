import sys

with open("src/App.jsx", "r") as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if "let [teleToken, setTeleToken]" in line:
        continue
    if "let [teleChat, setTeleChat]" in line:
        continue
    if "async function sendTele(msg) {" in line:
        skip = True
        continue
    if skip:
        if "  }" in line and "catch(e) { console.error" in line:
            skip = False
        continue
    if "localStorage.setItem(\"tele_token\", teleToken.trim());" in line:
        continue
    if "localStorage.setItem(\"tele_chat\", teleChat.trim());" in line:
        continue
    if "if (ev.p >= 90) sendTele" in line:
        line = line.replace('if (ev.p >= 90) sendTele(`🚨 <b>Market Scanner</b>\\n${ev.t}\\nTime: ${time(Date.now())}`);', '')
    if "sendTele(msg);" in line:
        continue
    if "}, [key, teleToken, teleChat]);" in line:
        line = line.replace('}, [key, teleToken, teleChat]);', '}, [key]);')
    if "<div className=\"label\">Telegram Bot Token</div>" in line:
        skip = True
        continue
    if skip and "<input value={teleChat}" in line:
        continue
    if skip and "placeholder=\"-100123456789\" />" in line:
        skip = False
        continue
    if "Pesan otomatis dikirim ke telegram jika sinyal active." in line:
        line = line.replace(' Pesan otomatis dikirim ke telegram jika sinyal active.', '')

    if "function connect() {" in line:
        new_lines.append("""
  async function fetchHistoryAndScan() {
    try {
      log("Memulihkan riwayat market...");
      let [m5, m15] = await Promise.all([fetchTf("5min").catch(()=>[]), fetchTf("15min").catch(()=>[])]);
      if (!m5.length || !m15.length) return;
      let evs = [...scanEvents("M5", m5, m5[m5.length-1].close), ...scanEvents("M15", m15, m15[m15.length-1].close)];
      evs.sort((a,b)=>b.p - a.p).slice(0, 10).forEach(ev => {
        if (!emittedKeys.current.has(ev.key)) {
          emittedKeys.current.add(ev.key);
          log(ev.t);
        }
      });
      log("Riwayat market dipulihkan.");
    } catch(e){}
  }

  function handleSaveConnect() {
    let btn = document.getElementById("btn-save-connect");
    if(btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-key-round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5"/></svg> <span>Menyimpan & Menghubungkan...</span>';
    setTimeout(() => {
        connect();
        if(btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg> <span>Tersimpan & Terhubung!</span>';
        setTimeout(() => {
            if(btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-key-round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5"/></svg> <span>Save & Connect All</span>';
        }, 3000);
    }, 500);
  }
""")
        new_lines.append(line)
        continue

    if "w.onopen = () => {" in line:
        new_lines.append(line)
        new_lines.append("      fetchHistoryAndScan();\n")
        continue

    if "<button className=\"action\" onClick={connect}>" in line:
        line = "            <button id=\"btn-save-connect\" className=\"action\" onClick={handleSaveConnect}>\n"
        new_lines.append(line)
        continue

    new_lines.append(line)

with open("src/App.jsx", "w") as f:
    f.writelines(new_lines)

