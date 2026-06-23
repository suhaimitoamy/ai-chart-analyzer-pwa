// Sandboxed IndexedDB for AI Chart Analyzer
const DB_NAME = "AmyFXAnalyzerDB";
const STORE_NAME = "state_store";

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveData(key, value) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn("IndexedDB Save Error, fallback to localStorage", err);
        try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){}
    }
}

export async function loadData(key, defaultVal) {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => {
                if (req.result !== undefined) {
                    resolve(req.result);
                } else {
                    // Try to migrate from localStorage
                    try {
                        const lsVal = localStorage.getItem(key);
                        if (lsVal) {
                            const parsed = JSON.parse(lsVal);
                            saveData(key, parsed); // async migrate
                            resolve(parsed);
                        } else {
                            resolve(defaultVal);
                        }
                    } catch(e) {
                        resolve(defaultVal);
                    }
                }
            };
            req.onerror = () => resolve(defaultVal);
        });
    } catch (err) {
        console.warn("IndexedDB Load Error, fallback to localStorage", err);
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : defaultVal;
        } catch(e) {
            return defaultVal;
        }
    }
}
