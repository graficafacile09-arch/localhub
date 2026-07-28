const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://favrminotoawoxhehshh.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTA3NzIsImV4cCI6MjA5OTI2Njc3Mn0.ff4dD_ZZ29Uup2u0Xbphr8JSkHpjJ7UH7YrGHppGT6o";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzY5MDc3MiwiZXhwOjIwOTkyNjY3NzJ9.1JbiEba4Fvm8F46AASrqV03Dk7usvbYg7mLKrTTkaWc";

const PRODUCT_ID = 13;
const NEGOZIO_ID = "e92a474a-b5bf-4ffe-bda2-d4b9bdf650fa";

async function main() {
  // Test 1: anon key without session
  console.log("=== TEST 1: anon client (no user session, like anonymous browser) ===");
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: before1, error: err1 } = await anonClient
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("BEFORE (anon):", JSON.stringify({ data: before1, error: err1 }));

  const updatePayload1 = {
    immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/test-anon-update.jpeg",
  };
  console.log("UPDATE PAYLOAD (anon):", JSON.stringify(updatePayload1));

  const { data: updated1, error: updateErr1 } = await anonClient
    .from("prodotti")
    .update(updatePayload1)
    .eq("id", PRODUCT_ID)
    .select("*")
    .single();
  console.log("UPDATE RESULT (anon):", JSON.stringify({ data: updated1, error: updateErr1 }));

  const { data: after1 } = await anonClient
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("AFTER (anon):", JSON.stringify(after1));

  // Restore
  await anonClient.from("prodotti").update({
    immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/e29b237c-af0e-4125-8d4e-8aba0bb75e71.jpeg",
  }).eq("id", PRODUCT_ID);

  // Test 2: service_role client
  console.log("\n=== TEST 2: admin client (service_role) ===");
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: before2 } = await adminClient
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("BEFORE (admin):", JSON.stringify(before2));

  const updatePayload2 = {
    immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/test-admin-update.jpeg",
  };
  console.log("UPDATE PAYLOAD (admin):", JSON.stringify(updatePayload2));

  const { data: updated2, error: updateErr2 } = await adminClient
    .from("prodotti")
    .update(updatePayload2)
    .eq("id", PRODUCT_ID)
    .select("*")
    .single();
  console.log("UPDATE RESULT (admin):", JSON.stringify({ data: updated2, error: updateErr2 }));

  const { data: after2 } = await adminClient
    .from("prodotti")
    .select("id, immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("AFTER (admin):", JSON.stringify(after2));

  // Final restore
  await adminClient.from("prodotti").update({
    immagine_principale: "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/e29b237c-af0e-4125-8d4e-8aba0bb75e71.jpeg",
  }).eq("id", PRODUCT_ID);

  console.log("\n=== SUMMARY ===");
  console.log("anon update succeeded:", updateErr1 === null);
  console.log("admin update succeeded:", updateErr2 === null);
}

main().catch(console.error);
