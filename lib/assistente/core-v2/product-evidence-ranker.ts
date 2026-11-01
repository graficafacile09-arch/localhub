/**
 * Pino Core v2 — evidence-based product ranking prototype.
 *
 * The seller is deliberately excluded from every relevance calculation.
 * This module is pure: it does not fetch products, access Supabase, mutate
 * catalog data, or change the production search path.
 */
import type { PinoCorePlan } from "./request-planner.ts";

export type ProductEvidence = {
  id?: string | number;
  name: string;
  category?: string | null;
  description?: string | null;
  fullDescription?: string | null;
  keywords?: string[] | null;
  sellerName?: string | null;
  price?: number | null;
  available?: boolean | null;
};

export type ProductEvidenceScore = {
  product: ProductEvidence;
  score: number;
  eligible: boolean;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  withinBudget: boolean | null;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function containsTerm(text: string, term: string): boolean {
  const haystack = tokens(text);
  const needle = tokens(term);
  if (!needle.length) return false;
  if (needle.length > 1) return normalize(text).includes(normalize(term));
  return haystack.includes(needle[0]);
}

function matchesAny(text: string, values: string[]): string[] {
  return values.filter((value) => value && containsTerm(text, value));
}

function evidenceText(product: ProductEvidence): {
  identity: string;
  details: string;
} {
  ].filter(Boolean).join(" ").replace(/(?:nella )?selezione demo di [^.]+/gi, " ");
  // Seller attribution is not product evidence. Excluding it structurally
  // prevents a business name such as "Mani in Pasta" from creating a match.
  const details = [
    product.description,
    product.fullDescription,
    ...(product.keywords ?? []),
  ].filter(Boolean).join(" ").replace(/(?:nella )?selezione demo di [^.]+/gi, " ");
  return { identity, details };
}

function confidenceFor(score: number): ProductEvidenceScore["confidence"] {
  if (score >= 85) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export function scoreProductEvidence(
  plan: Pick<PinoCorePlan, "route" | "subject" | "query" | "attributes" | "exclusions" | "minPrice" | "maxPrice">,
  product: ProductEvidence,
): ProductEvidenceScore {
  const { identity, details } = evidenceText(product);
  const identityText = normalize(identity);
  const detailsText = normalize(details);
  const allProductText = normalize([identity, details].join(" "));
  const reasons: string[] = [];
  let score = 0;
  let hasSubjectEvidence = false;

  if (plan.route !== "catalog" || !plan.subject) {
    return {
      product,
      score: 0,
      eligible: false,
      confidence: "low",
      reasons: ["no_catalog_subject"],
      withinBudget: null,
    };
  }

  const subject = normalize(plan.subject);
  if (containsTerm(identityText, subject)) {
    score += 100;
    hasSubjectEvidence = true;
    reasons.push("subject_in_name_or_category");
  } else if (containsTerm(detailsText, subject)) {
    score += 55;
    hasSubjectEvidence = true;
    reasons.push("subject_in_product_description_or_keywords");
  }

  const attributes = (plan.attributes ?? []).map(normalize).filter((v) => v.length > 2);
  const identityAttributes = matchesAny(identityText, attributes);
  const detailAttributes = matchesAny(detailsText, attributes);

  if (identityAttributes.length) {
    score += Math.min(identityAttributes.length * 24, 48);
    reasons.push("attributes_match_identity");
  }
  if (detailAttributes.length) {
    score += Math.min(detailAttributes.length * 10, 25);
    reasons.push("attributes_match_product_details");
  }

  const exclusions = (plan.exclusions ?? []).map(normalize).filter(Boolean);
  const excluded = exclusions.find((term) => containsTerm(allProductText, term));
  if (excluded) {
    return {
      product,
      score: score - 1000,
      eligible: false,
      confidence: "low",
      reasons: ["explicit_exclusion_match", `excluded:${excluded}`],
      withinBudget: null,
    };
  }

  let withinBudget: boolean | null = null;
  if (product.price != null && Number.isFinite(product.price)) {
    if (plan.maxPrice != null) {
      withinBudget = product.price <= plan.maxPrice;
      score += withinBudget ? 15 : -18;
      reasons.push(withinBudget ? "within_maximum_budget" : "above_maximum_budget");
    }
    if (plan.minPrice != null) {
      const meetsMinimum = product.price >= plan.minPrice;
      score += meetsMinimum ? 8 : -12;
      reasons.push(meetsMinimum ? "meets_minimum_budget" : "below_minimum_budget");
    }
  } else if (plan.minPrice != null || plan.maxPrice != null) {
    score -= 4;
    reasons.push("price_not_available");
  }

  if (product.available === false) {
    score -= 25;
    reasons.push("not_available");
  }

  // A subject signal is mandatory. Matching only a color, size, or price is
  // never enough to make an unrelated product eligible.
  const eligible = hasSubjectEvidence && score >= 35;
  if (!hasSubjectEvidence) reasons.push("missing_subject_evidence");
  if (eligible && !reasons.length) reasons.push("verified_product_evidence");

  return {
    product,
    score,
    eligible,
    confidence: confidenceFor(score),
    reasons,
    withinBudget,
  };
}

export function rankProductEvidence(
  plan: Pick<PinoCorePlan, "route" | "subject" | "query" | "attributes" | "exclusions" | "minPrice" | "maxPrice">,
  products: ProductEvidence[],
): ProductEvidenceScore[] {
  return products
    .map((product) => scoreProductEvidence(plan, product))
    .filter((result) => result.eligible)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.withinBudget !== b.withinBudget) {
        if (a.withinBudget === true) return -1;
        if (b.withinBudget === true) return 1;
      }
      const priceA = a.product.price ?? Number.POSITIVE_INFINITY;
      const priceB = b.product.price ?? Number.POSITIVE_INFINITY;
      if (priceA !== priceB) return priceA - priceB;
      return a.product.name.localeCompare(b.product.name, "it");
    });
}
