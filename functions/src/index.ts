import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

// ---- Config / Secrets ----
const KEEPA_KEY = defineSecret("KEEPA_KEY");
const KEEPA_DOMAIN = defineString("KEEPA_DOMAIN", { default: "1" }); // 1 = US

type SearchInput = {
  keyword: string;
  minPrice?: number; // cents
  maxPrice?: number; // cents
  maxResults?: number;
};

type ProductLite = {
  asin: string;
  title: string;
  buyBoxPrice?: number;
  avg30SalesRank?: number;
  category?: string;
  score?: number;
};

// ---------- Diagnostic: verify Keepa key / tokens ----------
export const keepaPing = onCall({ secrets: [KEEPA_KEY], region: "us-central1" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required.");

  const key = KEEPA_KEY.value();
  const url = new URL("https://api.keepa.com/token");
  url.searchParams.set("key", key);
  url.searchParams.set("domain", KEEPA_DOMAIN.value() || "1");

  const r = await fetch(url.toString());
  const body = await r.json().catch(() => ({}));

  if (!r.ok) {
    logger.error("keepaPing HTTP", r.status, body);
    throw new HttpsError("failed-precondition", `Keepa /token HTTP ${r.status}`);
  }
  if ((body as any).error) {
    logger.error("keepaPing error", (body as any).error);
    throw new HttpsError("failed-precondition", `Keepa error: ${JSON.stringify((body as any).error)}`);
  }

  return body; // typically includes tokensLeft, refillIn, etc.
});

// ---------- Main search function ----------
export const searchProducts = onCall({ secrets: [KEEPA_KEY], region: "us-central1" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required.");

  const { keyword, minPrice, maxPrice, maxResults = 20 } = (req.data || {}) as SearchInput;
  if (!keyword || typeof keyword !== "string") {
    throw new HttpsError("invalid-argument", "Keyword is required.");
  }

  const keepaKey = KEEPA_KEY.value();
  const domain = Number(KEEPA_DOMAIN.value() || "1");

  try {
    // 1) Search ASINs
    const searchUrl = new URL("https://api.keepa.com/search");
    searchUrl.searchParams.set("key", keepaKey);
    searchUrl.searchParams.set("domain", String(domain));
    searchUrl.searchParams.set("type", "product");
    searchUrl.searchParams.set("term", keyword);

    const searchRes = await fetch(searchUrl.toString());
    const searchJson: any = await searchRes.json().catch(() => ({}));
    if (!searchRes.ok) {
      logger.error("Keepa search HTTP", searchRes.status, searchJson);
      throw new HttpsError("failed-precondition", `Keepa search HTTP ${searchRes.status}`);
    }
    if (searchJson?.error) {
      logger.error("Keepa search error", searchJson.error);
      throw new HttpsError("failed-precondition", `Keepa search error: ${JSON.stringify(searchJson.error)}`);
    }

    const asinList: string[] = (searchJson.asinList || []).slice(0, 40);
    if (asinList.length === 0) return [];

    // 2) Product details
    const productUrl = new URL("https://api.keepa.com/product");
    productUrl.searchParams.set("key", keepaKey);
    productUrl.searchParams.set("domain", String(domain));
    productUrl.searchParams.set("asin", asinList.join(","));
    productUrl.searchParams.set("buybox", "1");

    const prodRes = await fetch(productUrl.toString());
    const prodJson: any = await prodRes.json().catch(() => ({}));
    if (!prodRes.ok) {
      logger.error("Keepa product HTTP", prodRes.status, prodJson);
      throw new HttpsError("failed-precondition", `Keepa product HTTP ${prodRes.status}`);
    }
    if (prodJson?.error) {
      logger.error("Keepa product error", prodJson.error);
      throw new HttpsError("failed-precondition", `Keepa product error: ${JSON.stringify(prodJson.error)}`);
    }

    const items: ProductLite[] = (prodJson.products || []).map((p: any) => {
      const buyBoxPrice = Array.isArray(p.buyBoxPriceHistory)
        ? p.buyBoxPriceHistory[p.buyBoxPriceHistory.length - 1]
        : undefined;

      const avgRank = p.stats?.salesRankAverage30 || p.stats?.salesRankAverage90;
      const score = avgRank ? Math.round(((100000 - avgRank) / 100000) * 100) / 100 : 0;

      return {
        asin: p.asin,
        title: p.title || "Unknown",
        buyBoxPrice,
        avg30SalesRank: avgRank,
        category: p.categoryTree?.at(-1)?.name,
        score,
      };
    });

    const filtered = items
      .filter((p) => {
        if (minPrice && p.buyBoxPrice && p.buyBoxPrice < minPrice) return false;
        if (maxPrice && p.buyBoxPrice && p.buyBoxPrice > maxPrice) return false;
        return true;
      })
      .slice(0, maxResults);

    return filtered;
  } catch (e: any) {
    logger.error("searchProducts failed:", e?.message ?? e);
    throw new HttpsError("internal", e?.message ?? "Unexpected error");
  }
});
