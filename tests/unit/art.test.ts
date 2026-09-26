import assert from "node:assert/strict";
import { test } from "node:test";
import { BEAST_BODY, WARDEN_BODY, WARDEN_LEG } from "../../src/render/bossArt.ts";
import { MASKS } from "../../src/render/sprites.ts";

test("every sprite mask is a clean rectangle", () => {
  const masks: [string, readonly string[]][] = [["warden", WARDEN_BODY], ["wardenLeg", WARDEN_LEG], ["beast", BEAST_BODY]];
  for (const [name, frames] of Object.entries(MASKS)) frames.forEach((frame, i) => masks.push([`${name}#${i}`, frame]));
  for (const [name, mask] of masks) {
    assert.ok(mask.length > 0, name);
    for (const row of mask) assert.equal(row.length, mask[0].length, `${name}: ragged row "${row}"`);
  }
  for (const kind of ["bomber", "lancer", "hexer", "sniper", "brute", "hive", "wraith", "prism"]) assert.ok(kind in MASKS, `${kind} has art`);
});
