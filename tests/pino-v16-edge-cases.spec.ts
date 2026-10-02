import { expect, test } from "@playwright/test";
import { apertoOra, rilevaFollowUp, soggettoPrecedente, motivoCategoria } from "../lib/assistente/conversazione";

test.describe("Pino V16 — casi limite conversazionali", () => {
  test("riconosce i follow-up brevi senza confonderli con ricerche complete", () => {
    expect(rilevaFollowUp("solo aperti ora")?.tipo).toBe("aperti");
    expect(rilevaFollowUp("più economici")?.tipo).toBe("economici");
    expect(rilevaFollowUp("fammi vedere altro")?.tipo).toBe("altro");
    expect(rilevaFollowUp("cerco una pizza aperta ora a Castrovillari")?.tipo).toBeUndefined();
  });

  test("mantiene il soggetto attraverso più follow-up", () => {
    expect(soggettoPrecedente([
      "cerco pizza a Castrovillari",
      "solo aperte ora",
      "più economiche",
      "fammi vedere altro",
    ])).toBe("cerco pizza a Castrovillari");
  });

  test("non dichiara aperto un negozio senza orari verificabili", () => {
    expect(apertoOra(null, new Date("2026-10-02T12:00:00"))).toBeNull();
    expect(apertoOra(undefined, new Date("2026-10-02T12:00:00"))).toBeNull();
  });

  test("motiva le attività solo tramite categorie reali", () => {
    expect(motivoCategoria([{ categoria: "pizzeria" }])).toContain("preparano cibo");
    expect(motivoCategoria([{ categoria: "categoria sconosciuta" }])).toBeNull();
  });
});
