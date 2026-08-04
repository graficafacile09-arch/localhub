# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: merchant-regression.spec.ts >> MERCHANT REGRESSION TEST (DB-synced + build-fixed) >> MERCHANT REGRESSION: login → dashboard → wizard ×3 → editor → 13 moduli → media → reload → elimina → logout
- Location: tests\merchant-regression.spec.ts:54:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Sconto E2E"
Received: undefined
```

# Page snapshot

```yaml
- generic [active] [ref=f23e1]:
  - main [ref=f23e2]:
    - generic [ref=f23e5]:
      - generic [ref=f23e6]:
        - link "Home" [ref=f23e7] [cursor=pointer]:
          - /url: /
        - generic [ref=f23e11]:
          - link "Area Commerciante" [ref=f23e12] [cursor=pointer]:
            - /url: /merchant
          - paragraph [ref=f23e13]: Area Commerciante
      - generic [ref=f23e14]:
        - generic [ref=f23e15]: commerciante-b.test@localhub.it
        - button "Esci" [ref=f23e17]
    - generic [ref=f23e21]:
      - complementary [ref=f23e22]:
        - generic [ref=f23e23]:
          - paragraph [ref=f23e24]: Navigazione
          - link "La mia area" [ref=f23e26] [cursor=pointer]:
            - /url: /merchant
        - generic [ref=f23e30]:
          - paragraph [ref=f23e31]: I tuoi negozi
          - generic [ref=f23e32]:
            - link "Negozio QA Commerciante B Bar" [ref=f23e33] [cursor=pointer]:
              - /url: /merchant/7bc172a9-7a9b-43ca-b4cc-9d5a47790dd3
              - generic [ref=f23e34]: Negozio QA Commerciante B
              - generic [ref=f23e35]: Bar
            - link "Negozio Rinominato 1785764115160 Bar" [ref=f23e36] [cursor=pointer]:
              - /url: /merchant/b5c531b2-3f0d-4a8e-a1b2-11c82d1eec3d
              - generic [ref=f23e37]: Negozio Rinominato 1785764115160
              - generic [ref=f23e38]: Bar
            - link "E2E Duplicato 1785764115160 Bar" [ref=f23e39] [cursor=pointer]:
              - /url: /merchant/c6998716-68bb-4250-9e10-640c1fc2aec6
              - generic [ref=f23e40]: E2E Duplicato 1785764115160
              - generic [ref=f23e41]: Bar
            - link "E2E Template 1785764115160 Bar" [ref=f23e42] [cursor=pointer]:
              - /url: /merchant/149e4b92-4f36-4612-a6ab-25838dfd6b7b
              - generic [ref=f23e43]: E2E Template 1785764115160
              - generic [ref=f23e44]: Bar
            - link "Negozio Rinominato 1785764256856 Bar" [ref=f23e45] [cursor=pointer]:
              - /url: /merchant/03358431-dc90-4d95-81c4-917b9a31d116
              - generic [ref=f23e46]: Negozio Rinominato 1785764256856
              - generic [ref=f23e47]: Bar
            - link "E2E Duplicato 1785764256856 Bar" [ref=f23e48] [cursor=pointer]:
              - /url: /merchant/e111634e-6eb4-4051-a5ad-6c613ed0dcd1
              - generic [ref=f23e49]: E2E Duplicato 1785764256856
              - generic [ref=f23e50]: Bar
            - link "E2E Template 1785764256856 Bar" [ref=f23e51] [cursor=pointer]:
              - /url: /merchant/a5766853-69fa-4844-9c33-10e817339060
              - generic [ref=f23e52]: E2E Template 1785764256856
              - generic [ref=f23e53]: Bar
            - link "Negozio Rinominato 1785764525042 Bar" [ref=f23e54] [cursor=pointer]:
              - /url: /merchant/c6a7255b-7108-4eb1-a43d-156042aa61b4
              - generic [ref=f23e55]: Negozio Rinominato 1785764525042
              - generic [ref=f23e56]: Bar
            - link "E2E Duplicato 1785764525042 Bar" [ref=f23e57] [cursor=pointer]:
              - /url: /merchant/ce3c07f0-6841-43ec-b0d9-8ecdfb610f44
              - generic [ref=f23e58]: E2E Duplicato 1785764525042
              - generic [ref=f23e59]: Bar
            - link "E2E Template 1785764525042 Bar" [ref=f23e60] [cursor=pointer]:
              - /url: /merchant/7234a9f6-3bc9-4116-8c71-191cbb29193b
              - generic [ref=f23e61]: E2E Template 1785764525042
              - generic [ref=f23e62]: Bar
            - link "Negozio Rinominato 1785764627856 Bar" [ref=f23e63] [cursor=pointer]:
              - /url: /merchant/06a79fd7-e6b2-4eeb-80b4-dd84c5a2accc
              - generic [ref=f23e64]: Negozio Rinominato 1785764627856
              - generic [ref=f23e65]: Bar
            - link "E2E Duplicato 1785764627856 Bar" [ref=f23e66] [cursor=pointer]:
              - /url: /merchant/da4714b7-1ebb-4858-8dc1-1f501475bd43
              - generic [ref=f23e67]: E2E Duplicato 1785764627856
              - generic [ref=f23e68]: Bar
            - link "E2E Template 1785764627856 Bar" [ref=f23e69] [cursor=pointer]:
              - /url: /merchant/ef74e50f-3488-49ee-a15f-3f23f9588ebd
              - generic [ref=f23e70]: E2E Template 1785764627856
              - generic [ref=f23e71]: Bar
            - link "Negozio Rinominato 1785846000138 Bar" [ref=f23e72] [cursor=pointer]:
              - /url: /merchant/cc8b8399-f60e-4a97-a12d-f28b9361e892
              - generic [ref=f23e73]: Negozio Rinominato 1785846000138
              - generic [ref=f23e74]: Bar
            - link "E2E Duplicato 1785846000138 Bar" [ref=f23e75] [cursor=pointer]:
              - /url: /merchant/451961f2-22ba-4bf6-84bb-b789a6cf8a82
              - generic [ref=f23e76]: E2E Duplicato 1785846000138
              - generic [ref=f23e77]: Bar
            - link "E2E Template 1785846000138 Bar" [ref=f23e78] [cursor=pointer]:
              - /url: /merchant/6ad98b6e-6e92-4c74-b912-ebdcea66f300
              - generic [ref=f23e79]: E2E Template 1785846000138
              - generic [ref=f23e80]: Bar
            - link "Negozio Rinominato 1785846112931 Bar" [ref=f23e81] [cursor=pointer]:
              - /url: /merchant/e7570274-cb62-4aa4-9375-7633ae1903d7
              - generic [ref=f23e82]: Negozio Rinominato 1785846112931
              - generic [ref=f23e83]: Bar
            - link "E2E Duplicato 1785846112931 Bar" [ref=f23e84] [cursor=pointer]:
              - /url: /merchant/3a198989-28ee-4a5c-8f5a-65ae15265b1c
              - generic [ref=f23e85]: E2E Duplicato 1785846112931
              - generic [ref=f23e86]: Bar
            - link "E2E Template 1785846112931 Bar" [ref=f23e87] [cursor=pointer]:
              - /url: /merchant/e69a01e9-0dd9-4e37-b430-469f4525d151
              - generic [ref=f23e88]: E2E Template 1785846112931
              - generic [ref=f23e89]: Bar
            - link "Negozio Rinominato 1785852836225 Bar" [ref=f23e90] [cursor=pointer]:
              - /url: /merchant/e6d2e13f-5c4e-4530-8eb5-9ce0cbee1f04
              - generic [ref=f23e91]: Negozio Rinominato 1785852836225
              - generic [ref=f23e92]: Bar
            - link "E2E Duplicato 1785852836225 Bar" [ref=f23e93] [cursor=pointer]:
              - /url: /merchant/9715473a-c318-42ac-90f5-e29ddba4528c
              - generic [ref=f23e94]: E2E Duplicato 1785852836225
              - generic [ref=f23e95]: Bar
            - link "E2E Template 1785852836225 Bar" [ref=f23e96] [cursor=pointer]:
              - /url: /merchant/85171669-ee5f-4a1a-b108-9aafa35dd3d6
              - generic [ref=f23e97]: E2E Template 1785852836225
              - generic [ref=f23e98]: Bar
            - link "Negozio Rinominato 1785852924485 Bar" [ref=f23e99] [cursor=pointer]:
              - /url: /merchant/cc40cdcc-55df-4303-adc4-37001892b085
              - generic [ref=f23e100]: Negozio Rinominato 1785852924485
              - generic [ref=f23e101]: Bar
            - link "E2E Template 1785852924485 Bar" [ref=f23e102] [cursor=pointer]:
              - /url: /merchant/cf5e42bd-9089-4ed8-8ee4-5c62a5575235
              - generic [ref=f23e103]: E2E Template 1785852924485
              - generic [ref=f23e104]: Bar
            - link "Negozio Rinominato 1785853046152 Bar" [ref=f23e105] [cursor=pointer]:
              - /url: /merchant/4b3fd7ab-d27b-4316-a68e-a44a0a78c906
              - generic [ref=f23e106]: Negozio Rinominato 1785853046152
              - generic [ref=f23e107]: Bar
            - link "E2E Template 1785853046152 Bar" [ref=f23e108] [cursor=pointer]:
              - /url: /merchant/8832866a-f28f-4586-b368-8845e83ebe97
              - generic [ref=f23e109]: E2E Template 1785853046152
              - generic [ref=f23e110]: Bar
            - link "Negozio Rinominato 1785853830905 Bar" [ref=f23e111] [cursor=pointer]:
              - /url: /merchant/0ba5c01e-838a-402f-ba63-942ae70d2d36
              - generic [ref=f23e112]: Negozio Rinominato 1785853830905
              - generic [ref=f23e113]: Bar
            - link "E2E Duplicato 1785853830905 Bar" [ref=f23e114] [cursor=pointer]:
              - /url: /merchant/b6bf75f3-b4af-49ef-8749-aef8d517b14a
              - generic [ref=f23e115]: E2E Duplicato 1785853830905
              - generic [ref=f23e116]: Bar
            - link "E2E Template 1785853830905 Bar" [ref=f23e117] [cursor=pointer]:
              - /url: /merchant/a8290226-44ca-418a-b9e2-3441db778ac6
              - generic [ref=f23e118]: E2E Template 1785853830905
              - generic [ref=f23e119]: Bar
            - link "Negozio Rinominato 1785853919772 Bar" [ref=f23e120] [cursor=pointer]:
              - /url: /merchant/b3d2d88e-44d1-4c85-b5fd-04cede273ffc
              - generic [ref=f23e121]: Negozio Rinominato 1785853919772
              - generic [ref=f23e122]: Bar
            - link "E2E Duplicato 1785853919772 Bar" [ref=f23e123] [cursor=pointer]:
              - /url: /merchant/76d3942e-3e41-42e4-8b0d-7b59e535039c
              - generic [ref=f23e124]: E2E Duplicato 1785853919772
              - generic [ref=f23e125]: Bar
            - link "E2E Template 1785853919772 Bar" [ref=f23e126] [cursor=pointer]:
              - /url: /merchant/a6b8a014-17d7-4e6e-9bdf-33dd4d953e34
              - generic [ref=f23e127]: E2E Template 1785853919772
              - generic [ref=f23e128]: Bar
            - link "Negozio Rinominato 1785853981363 Bar" [ref=f23e129] [cursor=pointer]:
              - /url: /merchant/1c7610df-eed0-42cb-9ad4-d5d7cc0a0b0b
              - generic [ref=f23e130]: Negozio Rinominato 1785853981363
              - generic [ref=f23e131]: Bar
            - link "E2E Duplicato 1785853981363 Bar" [ref=f23e132] [cursor=pointer]:
              - /url: /merchant/32c138a0-d71c-4517-ac98-e51215517aa6
              - generic [ref=f23e133]: E2E Duplicato 1785853981363
              - generic [ref=f23e134]: Bar
            - link "E2E Template 1785853981363 Bar" [ref=f23e135] [cursor=pointer]:
              - /url: /merchant/2fbef551-eb43-4f1b-b55e-602fea218aea
              - generic [ref=f23e136]: E2E Template 1785853981363
              - generic [ref=f23e137]: Bar
            - link "Negozio Rinominato 1785854085556 Bar" [ref=f23e138] [cursor=pointer]:
              - /url: /merchant/30f5a2d8-99e5-478a-993d-3d00dceef71f
              - generic [ref=f23e139]: Negozio Rinominato 1785854085556
              - generic [ref=f23e140]: Bar
            - link "E2E Duplicato 1785854085556 Bar" [ref=f23e141] [cursor=pointer]:
              - /url: /merchant/44abf669-103b-46ea-80cc-0d2b7ed57e30
              - generic [ref=f23e142]: E2E Duplicato 1785854085556
              - generic [ref=f23e143]: Bar
            - link "E2E Template 1785854085556 Bar" [ref=f23e144] [cursor=pointer]:
              - /url: /merchant/0ec6a58c-5949-4464-92ed-ce96e571c899
              - generic [ref=f23e145]: E2E Template 1785854085556
              - generic [ref=f23e146]: Bar
            - link "Negozio Rinominato 1785854623461 Bar" [ref=f23e147] [cursor=pointer]:
              - /url: /merchant/365f5e9e-c5e2-4ae5-b500-037d498013dd
              - generic [ref=f23e148]: Negozio Rinominato 1785854623461
              - generic [ref=f23e149]: Bar
            - link "E2E Duplicato 1785854623461 Bar" [ref=f23e150] [cursor=pointer]:
              - /url: /merchant/8de26546-57cb-419a-85d8-d6e3092b4601
              - generic [ref=f23e151]: E2E Duplicato 1785854623461
              - generic [ref=f23e152]: Bar
            - link "E2E Template 1785854623461 Bar" [ref=f23e153] [cursor=pointer]:
              - /url: /merchant/2cb8e6bf-3985-4784-96a4-1b45dc495666
              - generic [ref=f23e154]: E2E Template 1785854623461
              - generic [ref=f23e155]: Bar
      - generic [ref=f23e157]:
        - complementary [ref=f23e158]:
          - navigation [ref=f23e159]:
            - generic [ref=f23e160]:
              - button "Dashboard" [ref=f23e161]
              - link "Libreria Media" [ref=f23e167] [cursor=pointer]:
                - /url: /merchant/365f5e9e-c5e2-4ae5-b500-037d498013dd/media
              - generic [ref=f23e172]:
                - button "Dati Base ✓" [ref=f23e173]:
                  - generic [ref=f23e178]: Dati Base
                  - generic [ref=f23e179]: ✓
                - generic [ref=f23e182]:
                  - button "Informazioni ✓" [ref=f23e183]:
                    - generic [ref=f23e188]: Informazioni
                    - generic [ref=f23e189]: ✓
                  - button "Immagini ✓" [ref=f23e191]:
                    - generic [ref=f23e196]: Immagini
                    - generic [ref=f23e197]: ✓
                  - button "Contatti ✓" [ref=f23e199]:
                    - generic [ref=f23e202]: Contatti
                    - generic [ref=f23e203]: ✓
                  - button "Posizione ✓" [ref=f23e205]:
                    - generic [ref=f23e209]: Posizione
                    - generic [ref=f23e210]: ✓
                  - button "Orari ✓" [ref=f23e212]:
                    - generic [ref=f23e216]: Orari
                    - generic [ref=f23e217]: ✓
              - generic [ref=f23e219]:
                - button "Catalogo" [ref=f23e220]
                - generic [ref=f23e228]:
                  - button "Prodotti" [ref=f23e229]
                  - button "Servizi 1 ✓" [ref=f23e235]:
                    - generic [ref=f23e239]: Servizi
                    - generic [ref=f23e240]:
                      - generic [ref=f23e241]: "1"
                      - generic [ref=f23e242]: ✓
                  - button "Offerte" [ref=f23e243]
                  - button "Eventi 1 ✓" [ref=f23e248]:
                    - generic [ref=f23e251]: Eventi
                    - generic [ref=f23e252]:
                      - generic [ref=f23e253]: "1"
                      - generic [ref=f23e254]: ✓
              - button "Online ✓" [ref=f23e256]:
                - generic [ref=f23e259]: Online
                - generic [ref=f23e260]: ✓
              - button "Altro ✓" [ref=f23e264]:
                - generic [ref=f23e268]: Altro
                - generic [ref=f23e269]: ✓
              - button "Manutenzione" [ref=f23e274]
              - button "Elimina negozio" [ref=f23e282]
        - main [ref=f23e288]:
          - generic [ref=f23e289]:
            - generic [ref=f23e290]:
              - generic [ref=f23e291]:
                - img "Logo" [ref=f23e293]
                - button "Cambia logo" [ref=f23e294]
                - generic [ref=f23e298]:
                  - generic [ref=f23e299]:
                    - textbox "Nome negozio" [ref=f23e301]: Negozio Rinominato 1785854623461
                    - generic [ref=f23e302]: Bozza
                  - paragraph [ref=f23e304]: Bar
                  - paragraph [ref=f23e305]: "Ultimo aggiornamento: 4 agosto 2026 alle ore 16:44"
                  - generic [ref=f23e306]:
                    - link "Anteprima negozio" [ref=f23e307] [cursor=pointer]:
                      - /url: /negozio/e2e-panificio-1785854623461
                    - button "Anteprima inline" [ref=f23e308]
                    - button "Applica Template" [ref=f23e309]
              - generic [ref=f23e313]:
                - paragraph [ref=f23e314]: Completezza profilo
                - paragraph [ref=f23e315]: 85%
            - generic [ref=f23e318]:
              - heading "Azioni rapide" [level=2] [ref=f23e319]
              - generic [ref=f23e320]:
                - button "Aggiungi prodotto" [ref=f23e321]
                - button "Modifica immagini" [ref=f23e326]
  - contentinfo [ref=f23e331]: © 2026 InCittà · Castrovillari
  - button "Apri l'Assistente AI" [ref=f23e332]:
    - generic [ref=f23e336]: AI
  - button "Open Next.js Dev Tools" [ref=f23e342] [cursor=pointer]
  - alert [ref=f23e346]
```

# Test source

```ts
  367 |     /* ── 17. SEO ──────────────────────────────────────────────────────────── */
  368 |     await test.step("17. SEO", async () => {
  369 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  370 |       log("Step 17: SEO");
  371 |       await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=seo`, { waitUntil: "domcontentloaded" });
  372 |       await expect(page.locator("body")).toContainText("SEO");
  373 |       await page.locator('input[placeholder="Titolo per i motori di ricerca"]').fill("Negozio E2E | LocalHub");
  374 |       await page.locator("textarea").fill("Descrizione SEO di test per il negozio E2E");
  375 |       const kw = page.getByPlaceholder("Digita una keyword SEO e premi Invio...");
  376 |       await kw.fill("pasticceria");
  377 |       await kw.press("Enter");
  378 |       await expect(page.locator("body")).toContainText("pasticceria");
  379 |       await saveModule(storeId);
  380 |     });
  381 | 
  382 |     /* ── 18. AI ───────────────────────────────────────────────────────────── */
  383 |     await test.step("18. AI", async () => {
  384 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  385 |       log("Step 18: AI");
  386 |       await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=ai`, { waitUntil: "domcontentloaded" });
  387 |       await expect(page.locator("body")).toContainText("Assistente AI");
  388 |       await page.locator("textarea").fill("Rispondi sempre in italiano e sii gentile.");
  389 |       await page.locator("select").selectOption("amichevole");
  390 |       const faq = page.getByPlaceholder("Domanda frequente (es. Fate consegne a domicilio?)");
  391 |       await faq.fill("Fate consegne a domicilio?");
  392 |       await faq.press("Enter");
  393 |       await expect(page.locator("body")).toContainText("Fate consegne a domicilio?");
  394 |       await saveModule(storeId);
  395 |     });
  396 | 
  397 |     /* ── 19. Media (copertina + galleria) ─────────────────────────────────── */
  398 |     await test.step("19. Media", async () => {
  399 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  400 |       log("Step 19: Media (copertina + galleria)");
  401 |       await page.goto(`${BASE}/merchant/${storeId}/edit?modulo=immagini`, { waitUntil: "domcontentloaded" });
  402 |       await expect(page.locator("body")).toContainText("Immagini");
  403 |       const galleryPosts: string[] = [];
  404 |       page.on("response", (r) => {
  405 |         if (r.url().includes(`/api/merchant/stores/${storeId}/gallery`) && r.request().method() === "POST") {
  406 |           galleryPosts.push(r.url());
  407 |         }
  408 |       });
  409 |       const inputs = page.locator('input[type="file"]');
  410 |       await inputs.nth(1).setInputFiles("fixtures/logo-test.png"); // copertina
  411 |       await expect.poll(() => galleryPosts.length, { timeout: 20000 }).toBe(1);
  412 |       await inputs.nth(2).setInputFiles("fixtures/logo-test.png"); // galleria
  413 |       await expect.poll(() => galleryPosts.length, { timeout: 20000 }).toBe(2);
  414 |       // both uploads also trigger a settings PUT; verify galleria persisted
  415 |       await expect
  416 |         .poll(
  417 |           async () => {
  418 |             const j = await page.evaluate(
  419 |               async (u) => (await fetch(u)).json(),
  420 |               `/api/merchant/stores/${storeId}/settings`
  421 |             );
  422 |             return (j.data?.settings?.galleria ?? []).length;
  423 |           },
  424 |           { timeout: 20000 }
  425 |         )
  426 |         .toBeGreaterThanOrEqual(1);
  427 |       await expect(page.locator("body")).toContainText("Immagini");
  428 |     });
  429 | 
  430 |     /* ── 20. Reload + verifica persistenza (API) ──────────────────────────── */
  431 |     await test.step("20. Reload + persistenza", async () => {
  432 |       if (!storeId) { test.skip(true, "requires a store"); return; }
  433 |       log("Step 20: Reload + verifica persistenza");
  434 |       await page.goto(`${BASE}/merchant/${storeId}/edit`, { waitUntil: "domcontentloaded" });
  435 |       await expect(page).toHaveURL(/\/merchant\/[^/]+\/edit/);
  436 |       await page.reload({ waitUntil: "domcontentloaded" });
  437 |       await expect(page.locator("body")).toContainText("Completezza profilo");
  438 |       // fetch the settings API directly (avoids the reload-destroys-response race)
  439 |       const s = await page.evaluate(
  440 |         async (u) => {
  441 |           const r = await fetch(u);
  442 |           const j = await r.json();
  443 |           return j.data.settings as {
  444 |             nome: string;
  445 |             descrizione: string;
  446 |             servizi: string[];
  447 |             data?: {
  448 |               offerte?: Array<{ titolo?: string }>;
  449 |               eventi?: Array<{ titolo?: string }>;
  450 |               ai_data?: { tono?: string };
  451 |             };
  452 |             telefono?: string;
  453 |             indirizzo?: string;
  454 |             citta?: string;
  455 |             orari?: Record<string, { apertura1?: string }>;
  456 |             facebook?: string;
  457 |             seo_title?: string;
  458 |             logo_url?: string;
  459 |             galleria?: string[];
  460 |           };
  461 |         },
  462 |         `/api/merchant/stores/${storeId}/settings`
  463 |       );
  464 |       expect(s.nome).toMatch(/Rinominato/);
  465 |       expect(s.descrizione).toMatch(/Descrizione aggiornata/);
  466 |       expect(Array.isArray(s.servizi) && s.servizi.includes("Consegna a domicilio"), "servizi persisted").toBe(true);
> 467 |       expect(s.data?.offerte?.[0]?.titolo).toBe("Sconto E2E");
      |                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  468 |       expect(s.data?.eventi?.[0]?.titolo).toBe("Degustazione E2E");
  469 |       expect(s.data?.ai_data?.tono).toBe("amichevole");
  470 |       expect(s.telefono).toBe("0981 123456");
  471 |       expect(s.indirizzo).toBe("Via Roma 1");
  472 |       expect(s.citta).toBe("Castrovillari");
  473 |       expect(s.orari?.["lunedì"]?.apertura1).toBe("08:00");
  474 |       expect(s.facebook).toBe("negozio-e2e");
  475 |       expect(s.seo_title).toBe("Negozio E2E | LocalHub");
  476 |       expect(s.logo_url).toBeTruthy();
  477 |       expect(Array.isArray(s.galleria) && s.galleria.length >= 1).toBe(true);
  478 |       log(`persistenza OK — storeId=${storeId}`);
  479 |     });
  480 | 
  481 |     /* ── 21. Elimina (negozio duplicato) ──────────────────────────────────── */
  482 |     await test.step("21. Elimina negozio", async () => {
  483 |       test.skip(!storeIdDuplicato, "requires the duplicated store");
  484 |       log(`Step 21: Elimina negozio (${storeIdDuplicato})`);
  485 |       await page.goto(`${BASE}/merchant/${storeIdDuplicato}/edit?modulo=zona-pericolosa`, {
  486 |         waitUntil: "domcontentloaded",
  487 |       });
  488 |       await expect(page.locator("body")).toContainText("Zona Pericolosa");
  489 |       const delPromise = page.waitForResponse(
  490 |         (r) => r.url().endsWith(`/api/merchant/stores/${storeIdDuplicato}`) && r.request().method() === "DELETE",
  491 |         { timeout: 15000 }
  492 |       );
  493 |       await page.getByRole("button", { name: "Sposta nel Cestino" }).click();
  494 |       const delRes = await delPromise;
  495 |       expect(delRes.status(), "store DELETE should be 200").toBe(200);
  496 |       await page.waitForURL(/\/merchant$/, { timeout: 15000 });
  497 |       await page.reload({ waitUntil: "domcontentloaded" });
  498 |       await expect(page.locator(`a[href*="/merchant/${storeIdDuplicato}"]`)).toHaveCount(0);
  499 |     });
  500 | 
  501 |     /* ── 22. Logout ───────────────────────────────────────────────────────── */
  502 |     await test.step("22. Logout", async () => {
  503 |       log("Step 22: Logout");
  504 |       await page.goto(`${BASE}/merchant`, { waitUntil: "domcontentloaded" });
  505 |       await page.locator('form[action="/api/auth/signout"] button[type="submit"]').first().click();
  506 |       await page.waitForURL(`${BASE}/login`, { timeout: 15000 });
  507 |       await expect(page).toHaveURL(/\/login/);
  508 |       // reload after logout → session is gone, still on login
  509 |       await page.reload({ waitUntil: "domcontentloaded" });
  510 |       await expect(page).toHaveURL(/\/login/);
  511 |     });
  512 |   });
  513 | });
  514 | 
```