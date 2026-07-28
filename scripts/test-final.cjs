const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://favrminotoawoxhehshh.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTA3NzIsImV4cCI6MjA5OTI2Njc3Mn0.ff4dD_ZZ29Uup2u0Xbphr8JSkHpjJ7UH7YrGHppGT6o";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzY5MDc3MiwiZXhwOjIwOTkyNjY3NzJ9.1JbiEba4Fvm8F46AASrqV03Dk7usvbYg7mLKrTTkaWc";

const PRODUCT_ID = 13;
const ORIGINAL_URL = "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/e29b237c-af0e-4125-8d4e-8aba0bb75e71.jpeg";
const TEST_URL = "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/__test_verify__.jpeg";

async function getCurrentValue(client) {
  const { data } = await client
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  return data?.immagine_principale;
}

async function main() {
  const checkClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  // STEP 1: Verify original
  console.log("=== STEP 1: Current value ===");
  const current1 = await getCurrentValue(checkClient);
  console.log("  immagine_principale =", current1);
  
  // STEP 2: Test 1 - fetch PATCH
  console.log("\n=== STEP 2: fetch PATCH (apikey=anon, Authorization=anon) ===");
  const url = `${SUPABASE_URL}/rest/v1/prodotti?id=eq.${PRODUCT_ID}`;
  
  const resp1 = await fetch(url, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ immagine_principale: TEST_URL })
  });
  console.log("  Status:", resp1.status);
  console.log("  Body:", await resp1.text());
  
  const current2 = await getCurrentValue(checkClient);
  console.log("  immagine_principale AFTER fetch PATCH =", current2);
  console.log("  CHANGED?", current2 !== current1);
  
  // Restore if needed
  if (current2 !== ORIGINAL_URL) {
    await fetch(url, {
      method: "PATCH",
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ immagine_principale: ORIGINAL_URL })
    });
    console.log("  Restored to original");
  }
  
  // STEP 3: Test 2 - Supabase JS update()
  console.log("\n=== STEP 3: Supabase JS update() ===");
  const client2 = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const { data: before3, error: be } = await client2
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("  Before:", before3?.immagine_principale);
  
  const { data: updData, error: updErr } = await client2
    .from("prodotti")
    .update({ immagine_principale: TEST_URL })
    .eq("id", PRODUCT_ID)
    .select("*");
  
  console.log("  Update result data:", updData);
  console.log("  Update result error:", updErr?.message || "null");
  
  const current3 = await getCurrentValue(checkClient);
  console.log("  immagine_principale AFTER client update =", current3);
  console.log("  CHANGED?", current3 !== before3?.immagine_principale);
  
  // STEP 4: Try with service_role in Authorization header directly
  console.log("\n=== STEP 4: service_role in PATCH (apikey=anon, Authorization=service_role) ===");
  const resp4 = await fetch(url, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ immagine_principale: TEST_URL })
  });
  console.log("  Status:", resp4.status);
  console.log("  Body:", await resp4.text());
  
  const current4 = await getCurrentValue(checkClient);
  console.log("  immagine_principale AFTER service_role PATCH =", current4);
  
  // Restore via the method that actually works
  if (current4 !== ORIGINAL_URL) {
    await fetch(url, {
      method: "PATCH",
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ immagine_principale: ORIGINAL_URL })
    });
    console.log("  Restored to original");
  }
  
  const final = await getCurrentValue(checkClient);
  console.log("\n=== FINAL VALUE ===");
  console.log("  immagine_principale =", final);
  console.log("  MATCHES ORIGINAL?", final === ORIGINAL_URL);
}
main().catch(console.error);
