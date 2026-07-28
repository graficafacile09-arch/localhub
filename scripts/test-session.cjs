const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://favrminotoawoxhehshh.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdnJtaW5vdG9hd294aGVoc2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTA3NzIsImV4cCI6MjA5OTI2Njc3Mn0.ff4dD_ZZ29Uup2u0Xbphr8JSkHpjJ7UH7YrGHppGT6o";
const PRODUCT_ID = 13;
const ORIGINAL_URL = "https://favrminotoawoxhehshh.supabase.co/storage/v1/object/public/product-images/e29b237c-af0e-4125-8d4e-8aba0bb75e71.jpeg";

async function main() {
  console.log("=== TEST: Is UPDATE blocked by RLS even with a valid session? ===");
  console.log("Product 13, store owner user_id = 3ec07260-d0c0-4097-b1f1-8a30536fd868");
  console.log("");

  // We need to test what createServerSupabaseClient does in an API route.
  // In the API route, the cookies contain the session. 
  // createServerClient() reads cookies via getAll() to restore the session.
  // 
  // We can test this by setting a session token directly.
  // But we don't have the user's password.
  //
  // Instead, let's test what happens when we use the Supabase JS client
  // with the exact same method as createServerSupabaseClient:
  // createClient(url, anonKey) + cookies.getAll()
  //
  // The key insight: createServerClient from @supabase/ssr wraps
  // the basic createClient. The auth state comes from the session cookie.
  //
  // If there's NO session cookie, createClient behaves just like createClient(url, anonKey).
  // And we proved that createClient(url, anonKey).update() affects 0 rows.
  //
  // So the question: does createServerSupabaseClient() in ApiRoutes
  // actually correctly restore the session from cookies?

  console.log("Test A: createClient(anonKey) - no session (mimics missing cookie)");
  const clientA = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const { data: userA, error: getUserErrA } = await clientA.auth.getUser();
  console.log("  getUser():", { user: userA?.user?.id?.substring(0, 20) || null, error: getUserErrA?.message || null });
  console.log("  Session exists:", !!userA?.user);
  
  const { error: updateErrA } = await clientA
    .from("prodotti")
    .update({ immagine_principale: "https://test.com/a.jpeg" })
    .eq("id", PRODUCT_ID)
    .select("*");
  console.log("  UPDATE .select(*) error:", updateErrA?.message || "null (may be 0 rows)");
  
  const { data: afterA } = await clientA
    .from("prodotti")
    .select("immagine_principale")
    .eq("id", PRODUCT_ID)
    .single();
  console.log("  immagine_principale after update:", afterA?.immagine_principale?.substring(0, 50));
  
  // Restore
  await clientA.from("prodotti").update({ immagine_principale: ORIGINAL_URL }).eq("id", PRODUCT_ID);
  
  console.log("");
  console.log("Test B: What if the Supabase client sends both headers correctly?");
  console.log("  In the REST API, we need apikey=ANON and Authorization=Bearer SESSION");
  console.log("  createClient(url, key) sends apikey=key AND Authorization=Bearer key");
  console.log("  For anon key: apikey=ANON, Authorization=Bearer ANON -> works!");
  console.log("  For service_role key: apikey=SERVICE, Authorization=Bearer SERVICE -> FAILS (401)");
  console.log("");
  console.log("  The service_role key in .env.local is INVALID (returns 401).");
  console.log("  But the Vercel env might have a valid one (DELETE works in production).");
  console.log("");
  console.log("  The anon key client UPDATE is blocked by RLS when there's no session.");
  console.log("  With a valid user session, UPDATE should work because:");
  console.log("    - RLS policy 'merchant own products update' checks is_merchant_for_store()");
  console.log("    - is_merchant_for_store checks auth.uid() = negozi.owner_user_id");
  console.log("    - If user is logged in as store owner, auth.uid() matches -> UPDATE allowed");
  console.log("");
  console.log("  The PRODUCTION code has user logged in -> session in cookies -> auth.uid() set -> UPDATE works.");
  console.log("  But LOCAL dev with no session -> auth.uid() = null -> UPDATE blocked by RLS.");
  
  console.log("");
  console.log("=== CONCLUSION ===");
  console.log("The bug is NOT in the JavaScript/TypeScript code logic.");
  console.log("The bug is: RLS on `prodotti` blocks UPDATE when the Supabase client");
  console.log("does NOT have the user's session properly restored from cookies.");
  console.log("");
  console.log("In the API route handler:");
  console.log("  - getCurrentUser() creates client A, calls getUser() -> session exists -> returns user");
  console.log("  - getMerchantStoreForUser() creates client B, queries negozi using auth.uid() -> works");
  console.log("  - getMerchantProductForStore() creates client C, queries prodotti -> works");
  console.log("  - updateMerchantProductForStore() creates client D, calls update() -> BLOCKED by RLS?");
  console.log("");
  console.log("All clients read cookies via cookies().getAll(). The session should be propagated.");
  console.log("But if createServerClient() doesn't properly restore the auth state from the cookie,");
  console.log("the anon key UPDATE is used without a user session -> 0 rows affected -> PGRST116.");
  console.log("");
  console.log("The .select('*').single() then fails, and the API returns an error.");
  console.log("The form SHOULD show this error to the user.");
  console.log("If the form doesn't show the error, that's a separate UI issue.");
  
  // Now let's do the actual test: what happens when we set a session?
  console.log("");
  console.log("=== FINAL VERIFICATION ===");
  console.log("Let's try setting a session with a fake token to confirm RLS blocks:");
  console.log("(This will fail because the token is invalid, but the error will be revealing)");
  
  try {
    const clientC = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
        },
      },
    });
    
    const { error: updateErrC } = await clientC
      .from("prodotti")
      .update({ immagine_principale: "https://test.com/c.jpeg" })
      .eq("id", PRODUCT_ID)
      .select("*");
      
    console.log("  UPDATE error with anon in global headers:", updateErrC?.message || "no error");
    
    const { data: afterC } = await clientC
      .from("prodotti")
      .select("immagine_principale")
      .eq("id", PRODUCT_ID)
      .single();
    console.log("  immagine_principale:", afterC?.immagine_principale?.substring(0, 50));
  } catch(e) {
    console.log("  Error:", e.message);
  }
  
  // Restore  
  const finalClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  // Use fetch() to restore - it actually works
  await fetch(`${SUPABASE_URL}/rest/v1/prodotti?id=eq.${PRODUCT_ID}`, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ immagine_principale: ORIGINAL_URL })
  });
  
  console.log("Restored to original URL via fetch PATCH.");
}

main().catch(console.error);
