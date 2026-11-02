import assert from "node:assert/strict";
import test from "node:test";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";
import {
  rankProductEvidence,
  scoreProductEvidence,
} from "../lib/assistente/core-v2/product-evidence-ranker.ts";

test("planner separates the product subject from descriptive attributes", () => {
  const plan = planPinoCoreRequest("Cerco un orologio con cinturino in pelle sotto 100 euro");
  assert.equal(plan.subject, "orologio");
  assert.deepEqual(plan.attributes, ["cinturino", "pelle"]);
  assert.equal(plan.maxPrice, 100);
});

test("seller name is never used as product relevance evidence", () => {
  const plan = planPinoCoreRequest("Cerco pasta sotto 5 euro");
  const taralli = scoreProductEvidence(plan, {
    name: "Taralli calabresi",
    category: "Prodotti da forno",
    description: "Taralli da forno, prodotto a base di farina nella selezione demo di Mani in Pasta.",
    keywords: ["taralli", "farina", "forno"],
    sellerName: "Mani in Pasta",
    price: 3,
  });
  assert.equal(taralli.eligible, false);
});

test("pasta ranking keeps Fileja and Maccheroni while excluding Taralli and biscuits", () => {
  const plan = planPinoCoreRequest("Cerco pasta sotto 5 euro");
  const ranked = rankProductEvidence(plan, [
    {
      name: "Taralli calabresi",
      category: "Prodotti da forno",
      description: "Taralli da forno, prodotto a base di farina nella selezione demo di Mani in Pasta.",
      keywords: ["taralli", "farina", "forno"],
      sellerName: "Mani in Pasta",
      price: 3,
    },
    {
      name: "Fileja di Tropea",
      category: "Alimentari",
      description: "Pasta tradizionale calabrese nel formato fileja, confezione da 500 g.",
      keywords: ["fileja", "Tropea", "pasta calabrese", "pasta tipica"],
      sellerName: "Mani in Pasta",
      price: 2,
    },
    {
      name: "Biscotti tradizionali calabresi",
      category: "Prodotti da forno",
      description: "Biscotti da forno a base di farina, nella selezione demo di Mani in Pasta.",
      keywords: ["biscotti", "farina", "dolci"],
      sellerName: "Mani in Pasta",
      price: 4,
    },
    {
      name: "Maccheroni al ferretto",
      category: "Alimentari",
      description: "Pasta tradizionale calabrese, proposta nella selezione demo di Mani in Pasta.",
      keywords: ["pasta", "maccheroni", "ferretto", "farina"],
      sellerName: "Mani in Pasta",
      price: 3.5,
    },
  ]);
  assert.deepEqual(ranked.map((item) => item.product.name), [
    "Fileja di Tropea",
    "Maccheroni al ferretto",
  ]);
  assert.ok(ranked.every((item) => item.withinBudget === true));
});

test("price preference ranks eligible products within budget before expensive alternatives", () => {
  const plan = planPinoCoreRequest("Cerco orologio sotto 100 euro");
  const ranked = rankProductEvidence(plan, [
    { name: "Orologio classico", category: "Accessori", price: 145 },
    { name: "Orologio sportivo", category: "Accessori", price: 79 },
    { name: "Orologio elegante", category: "Accessori", price: 95 },
  ]);
  assert.equal(ranked[0].product.name, "Orologio sportivo");
  assert.equal(ranked[1].product.name, "Orologio elegante");
  assert.equal(ranked[2].product.name, "Orologio classico");
});

test("product attributes improve relevance without replacing subject evidence", () => {
  const plan = planPinoCoreRequest("Cerco un orologio con cinturino in pelle sotto 100 euro");
  const score = scoreProductEvidence(plan, {
    name: "Orologio classico",
    category: "Accessori",
    description: "Cinturino in pelle marrone, quadrante analogico.",
    price: 89,
  });
  assert.equal(score.eligible, true);
  assert.ok(score.reasons.includes("attributes_match_product_details"));
});

test("matching only an attribute cannot make an unrelated product eligible", () => {
  const plan = planPinoCoreRequest("Cerco un orologio con cinturino in pelle");
  const score = scoreProductEvidence(plan, {
    name: "Borsa in pelle",
    category: "Accessori",
    description: "Realizzata in pelle, con cinturino regolabile.",
    price: 49,
  });
  assert.equal(score.eligible, false);
});

test("explicit product exclusions are hard filters", () => {
  const plan = planPinoCoreRequest("Cerco pasta senza glutine sotto 8 euro");
  const score = scoreProductEvidence(plan, {
    name: "Pasta tradizionale",
    category: "Alimentari",
    description: "Pasta di grano duro con glutine.",
    price: 4,
  });
  assert.equal(score.eligible, false);
  assert.ok(score.reasons.includes("explicit_exclusion_match"));
});

test("no-subject plans cannot return products", () => {
  const plan = planPinoCoreRequest("Qualcosa di bello");
  const score = scoreProductEvidence(plan, {
    name: "Orologio",
    category: "Accessori",
    price: 50,
  });
  assert.equal(score.eligible, false);
  assert.ok(score.reasons.includes("no_catalog_subject"));
});
