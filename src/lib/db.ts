import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Log a user's product search keyword.
 * Creates a document in: niches/{uid}/searches/
 */
export async function logSearch(uid: string, keyword: string, meta: any = {}) {
  try {
    const ref = await addDoc(collection(db, "niches", uid, "searches"), {
      keyword,
      createdAt: serverTimestamp(),
      ...meta,
    });
    console.log(`✅ Search logged: ${keyword}`);
    return ref;
  } catch (error) {
    console.error("❌ Error logging search:", error);
    throw error;
  }
}

/**
 * Save a product result the user wants to keep.
 * Creates a document in: niches/{uid}/results/
 */
export async function saveResult(uid: string, item: any) {
  try {
    const ref = doc(collection(db, "niches", uid, "results"));
    await setDoc(ref, {
      ...item,
      savedAt: serverTimestamp(),
    });
    console.log(`💾 Saved result for ASIN: ${item.asin}`);
    return ref;
  } catch (error) {
    console.error("❌ Error saving result:", error);
    throw error;
  }
}
