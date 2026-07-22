/**
 * LocalHub Brain — Test Suite
 *
 * Test di base per verificare il funzionamento del modulo Brain.
 * Eseguire con: node --loader ts-node/esm lib/brain/test.ts
 * oppure: tsx lib/brain/test.ts
 */

import { brainSearch } from "./index";

async function runTests() {
  console.log("=== LocalHub Brain - Test Suite ===\n");

  const testQueries = [
    "pizzeria",
    "farmacia",
    "bar",
    "parrucchiere",
    "ristorante",
    "ho mal di testa",
    "farmacia aperta adesso",
    "bar vicino piazza municipio",
    "meglio coop o conad",
  ];

  for (const query of testQueries) {
    console.log(`\n[TEST] Query: "${query}"`);

    try {
      const result = await brainSearch(query);

      if (!result) {
        console.log("  ⚠️  Brain non abilitato o risultato null");
        continue;
      }

      console.log(`  ✓ Processing time: ${result.processingMs}ms`);
      console.log(`  ✓ Source: ${result.source}`);

      // Intent
      const intent = result.data.context.intent;
      if (intent) {
        console.log(`  ✓ Intent: ${intent.type}`);
        console.log(`  ✓ Confidence: ${intent.confidence}%`);
        if (intent.extractedEntities.length > 0) {
          console.log(
            `  ✓ Entities: [${intent.extractedEntities.join(", ")}]`
          );
        } else {
          console.log(`  ✓ Entities: nessuna`);
        }
      }

      console.log(
        `  ✓ Candidati trovati: ${result.data.context.candidates.length}`
      );

      if (result.data.context.candidates.length > 0) {
        const top3 = result.data.context.candidates.slice(0, 3);
        console.log(`  ✓ Top 3 risultati:`);
        top3.forEach((candidate, idx) => {
          const nome = (candidate.data as { nome?: string }).nome ?? "N/A";
          console.log(
            `     ${idx + 1}. ${nome} (score: ${candidate.combinedScore.toFixed(2)})`
          );
        });
      }

      console.log(`  ✓ Query espansa: "${result.data.context.queryExpanded}"`);
      console.log(
        `  ✓ Termini estratti: [${result.data.context.queryTerms.join(", ")}]`
      );
    } catch (error) {
      console.error(`  ✗ Errore:`, error);
    }
  }

  console.log("\n=== Fine test ===\n");
}

// Esegue i test se chiamato direttamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };
