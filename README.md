# XAUUSD ICT Chart Analyzer PWA

Versi Web App / PWA dari aplikasi XAUUSD ICT Chart Analyzer.

## Fungsi

- **Live Market Event Scanner** 🔍 (Mendeteksi BOS, MSS, Sweep, FVG, OB secara real-time)
- **Multi-Timeframe Analysis (MTF)** 📊 (Menganalisa LTF dan HTF secara bersamaan)
- **Telegram Bot Integration** 🤖 (Notifikasi Setup, TP, dan SL langsung ke Telegram)
- **PDF Report Generator** 📄 (Cetak History Trade menjadi PDF)
- Real-time XAU/USD dari Twelve Data WebSocket (Auto-Reconnect & Fallback API)
- Gold Price live & WIB Time live
- Session otomatis dengan timezone asli dan DST (Asian, London, NY, dll)
- Rule-based SMC engine lokal yang canggih
- History Trade berdasarkan perhitungan TP/STOP
- PWA bisa dibuka di Android (sebagai APK/Web), iPhone, Windows, Mac, dan browser

## Cara menjalankan lokal

```bash
npm install
npm run dev
```

## Cara build

```bash
npm run build
```

## Deploy

Bisa deploy ke Vercel, Netlify, atau GitHub Pages.

## Catatan

Aplikasi ini bukan auto-trade. Aplikasi hanya membantu mapping market dan membaca event market.
