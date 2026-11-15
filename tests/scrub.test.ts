// npm test — ce qui part vers l'IA est nettoyé
import { test } from "node:test";
import assert from "node:assert/strict";
import { configure } from "../lib/categories.ts";
import { scrub } from "../lib/scrub.ts";

test("nom et numéros retirés, le reste intact", () => {
  configure({ ownerNames: ["JEAN DUPONT"] });
  assert.equal(scrub("VIR DE M JEAN DUPONT REF 123456789"), "VIR DE M [moi] REF •••");
  assert.equal(scrub("Virement FR76 3000 6000 0112 3456 7890 189"), "Virement •••");
  assert.equal(scrub("Carte 12/10 LIDL 1184"), "Carte 12/10 LIDL 1184");
});
