const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://favrminotoawoxhehshh.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTA3NzIsImV4cCI6MjA5OTI2Njc3Mn0.ff4dD_ZZ29Uup2u0Xbphr8JSkHpjJ7UH7YrGHppGT6o";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzY5MDc3MiwiZXhwOjIwOTkyNjY3NzJ9.1JbiEba4Fvm8F46AASrqV03Dk7usvbYg7mLKrTTkaWc";

const PRODUCT_ID = 13;
const ORIGINAL_URL = "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/e29b237c-af0e-4125-8d4e-8aba0bb75e71.jpeg";

async function main() {
  console.log("=== TEST with service_role key directly ===");
  
  // Try service_role with the correct format
  // In Supabase JS, createClient uses the key as both apikey and Authorization
  // But the REST API expects apikey = anon_key and Authorization = service_role key
  // Let's use the low-level fetch API instead
  
  const testUrl = `${SUPABASE_URL}/rest/v1/prodotti?id=eq.${PRODUCT_ID}&select=id,immagine_principale`;
  
  // Test 1: PATCH with apikey=anon, Authorization=anon (worked via Invoke-RestMethod)
  console.log("\n--- Test 1: PATCH via fetch with anon key in both headers ---");
  
  const response1 = await fetch(testUrl, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/test-fetch-update.jpeg"
    })
  });
  
  console.log("Status 1:", response1.status);
  const text1 = await response1.text();
  console.log("Response 1:", text1);
  
  // Restore
  await fetch(testUrl, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ immagine_principale: ORIGINAL_URL })
  });
  
  // Test 2: PATCH with service_role in Authorization
  console.log("\n--- Test 2: PATCH with apikey=anon, Authorization=service_role ---");
  
  const response2 = await fetch(testUrl, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/test-service-update.jpeg"
    })
  });
  
  console.log("Status 2:", response2.status);
  const text2 = await response2.text();
  console.log("Response 2:", text2);
  
  // Restore
  await fetch(testUrl, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ immagine_principale: ORIGINAL_URL })
  });

  // Test 3: Now test what Supabase JS client actually sends
  console.log("\n--- Test 3: Using Supabase JS client (createClient) ---");
  
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  // First, let's check what headers the client sends by looking at the internal fetch
  const { data: before } = await client
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("Before (from client):", before?.immagine_principale?.substring(0, 50));
  
  // Now try update WITHOUT .select() to avoid PGRST116
  const { error: updateErr } = await client
    .from("prodotti")
    .update({ immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/test-client-update.jpeg" })
    .eq("id", PRODUCT_ID);
  
  console.log("Update error (no .select):", updateErr);
  
  // Check if the value changed
  const { data: after } = await client
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("After (from client):", after?.immagine_principale?.substring(0, 50));
  console.log("Changed?", before?.immagine_principale !== after?.immagine_principale);
  
  // Restore
  await client.from("prodotti").update({ immagine_principale: ORIGINAL_URL }).eq("id", PRODUCT_ID);
  
  console.log("\n=== DONE ===");
}

main().catch(console.error);
