import { test } from "vitest";
import assert from "node:assert/strict";
import { celluleCsv, versCsv } from "./csv";

test("guillemets, séparateurs et sauts de ligne sont protégés", () => {
  assert.equal(celluleCsv('Dupont; "Jeanne"'), '"Dupont; ""Jeanne"""');
  assert.equal(celluleCsv("ligne1\nligne2"), '"ligne1\nligne2"');
  assert.equal(celluleCsv("simple"), "simple");
  assert.equal(celluleCsv(null), "");
  assert.equal(celluleCsv(3), "3");
});

test("injection de formule neutralisée", () => {
  assert.equal(celluleCsv("=1+1"), "'=1+1");
  assert.equal(celluleCsv("+33 6 11"), "'+33 6 11");
  assert.equal(celluleCsv("-2"), "'-2");
  assert.equal(celluleCsv("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(celluleCsv('=HYPERLINK("http://x";"y")'), `"'=HYPERLINK(""http://x"";""y"")"`);
});

test("document : BOM, en-têtes, CRLF", () => {
  const csv = versCsv(["Date", "Patient"], [["2026-10-17", "Marie Dupré"]]);
  assert.equal(csv, "﻿Date;Patient\r\n2026-10-17;Marie Dupré\r\n");
});
