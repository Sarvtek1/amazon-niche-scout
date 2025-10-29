import { useEffect, useState } from "react";
import { auth, db, provider } from "./lib/firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "./lib/firebase";
import { logSearch, saveResult } from "./lib/db";

export default function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [keepaInfo, setKeepaInfo] = useState<any | null>(null);
  const [keyword, setKeyword] = useState("silicone spatula");

  // extra: show Firestore data in the UI
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);

  // keep auth state in sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // subscribe to recent searches & saved results when user is present
  useEffect(() => {
    if (!user) return;

    const q1 = query(
      collection(db, "niches", user.uid, "searches"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub1 = onSnapshot(q1, (snap) => {
      setRecentSearches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const q2 = query(
      collection(db, "niches", user.uid, "results"),
      orderBy("savedAt", "desc"),
      limit(10)
    );
    const unsub2 = onSnapshot(q2, (snap) => {
      setSaved(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const loginGoogle = async () => { await signInWithPopup(auth, provider); };
  const logout = async () => { await signOut(auth); };

  // Firestore write test (quick sanity check)
  const testFirestore = async () => {
    if (!user) return alert("Please log in first");
    const ref = doc(db, "niches", user.uid, "searches", "testDoc");
    await setDoc(ref, { keyword: "test run", createdAt: serverTimestamp() });
    alert("Firestore write OK ✅ (niches/{uid}/searches/testDoc)");
  };

  // Keepa diagnostic
  const checkKeepa = async () => {
    try {
      if (!user) return alert("Please log in first");
      setLoading(true);
      const call = httpsCallable(functions, "keepaPing");
      const res: any = await call();
      setKeepaInfo(res.data);
      alert(`Keepa OK. tokensLeft=${res.data?.tokensLeft ?? "?"}`);
      console.log("keepaPing:", res.data);
    } catch (e: any) {
      console.error("keepaPing error:", e);
      alert(e.message || "keepaPing failed");
    } finally {
      setLoading(false);
    }
  };

  // 🔎 Search using Keepa + log to Firestore first
  const searchKeepa = async () => {
    try {
      if (!user) return alert("Please log in first");
      if (!keyword.trim()) return alert("Enter a keyword");
      setLoading(true);

      // 1) log search intent
      await logSearch(user.uid, keyword);

      // 2) call function
      const call = httpsCallable<any, any[]>(functions, "searchProducts");
      const res = await call({ keyword, maxResults: 10 });
      setResults(res.data || []);
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "";
      if (msg.includes("resource-exhausted") || msg.includes("429")) {
        alert("Keepa tokens are depleted. Please wait for refill or add tokens.");
      } else {
        alert(msg || "Function call failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // 💾 Save a chosen result
  const onSave = async (item: any) => {
    if (!user) return alert("Please log in first");
    await saveResult(user.uid, item);
    alert(`Saved ${item.asin}`);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Amazon Niche Scout</h1>

      {!user ? (
        <button onClick={loginGoogle}>Sign in with Google</button>
      ) : (
        <>
          <p>Welcome, <b>{user.email}</b></p>

          {/* Search bar + actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Enter keyword (e.g., silicone spatula)"
              style={{ padding: 6, minWidth: 280 }}
            />
            <button onClick={searchKeepa} disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </button>
            <button onClick={checkKeepa} disabled={loading}>
              {loading ? "Checking…" : "Check Keepa Key"}
            </button>
            <button onClick={testFirestore}>Write Firestore Test</button>
            <button onClick={logout}>Logout</button>
          </div>

          {/* Keepa token info */}
          {keepaInfo && (
            <div style={{ marginTop: 12 }}>
              <strong>Keepa:</strong>{" "}
              tokensLeft={keepaInfo.tokensLeft ?? "?"}, refillIn={keepaInfo.refillIn ?? "?"}s
            </div>
          )}

          {/* Results table with Save buttons */}
          {results.length > 0 && (
            <table style={{ marginTop: 16, borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Title</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>ASIN</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>BuyBox</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Score</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }} />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.asin}>
                    <td style={{ padding: 6 }}>{r.title}</td>
                    <td style={{ padding: 6 }}>{r.asin}</td>
                    <td style={{ padding: 6 }}>{r.buyBoxPrice ? `$${(r.buyBoxPrice / 100).toFixed(2)}` : "N/A"}</td>
                    <td style={{ padding: 6 }}>{r.score ?? "-"}</td>
                    <td style={{ padding: 6 }}>
                      <button onClick={() => onSave(r)}>Save</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Recent Searches */}
          <h3 style={{ marginTop: 24 }}>Recent Searches</h3>
          {recentSearches.length === 0 ? (
            <p style={{ color: "#555" }}>No searches yet.</p>
          ) : (
            <ul>
              {recentSearches.map((s) => (
                <li key={s.id}>
                  {s.keyword}{" "}
                  {s.createdAt?.toDate ? `— ${s.createdAt.toDate().toLocaleString()}` : ""}
                </li>
              ))}
            </ul>
          )}

          {/* Saved Results */}
          <h3 style={{ marginTop: 24 }}>Saved Results</h3>
          {saved.length === 0 ? (
            <p style={{ color: "#555" }}>No saved results yet.</p>
          ) : (
            <ul>
              {saved.map((r) => (
                <li key={r.id}>
                  <strong>{r.title}</strong> — {r.asin}
                  {r.buyBoxPrice ? ` ($${(r.buyBoxPrice / 100).toFixed(2)})` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
