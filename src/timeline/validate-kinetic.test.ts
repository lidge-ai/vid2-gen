import assert from "node:assert/strict";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { TimelineSchema } from "./schema.ts";
import { validateTimeline } from "./validate.ts";

const timeline = (states: unknown[], extra: Record<string, unknown> = {}) => TimelineSchema.parse({ version: 1, scenes: [{ id: "a", duration: "1s",
  layers: [{ type: "kinetic", states, ...extra }] }] });
const paths = (states: unknown[], extra?: Record<string, unknown>) => validateTimeline(timeline(states, extra), { baseDir: tmpdir() }).map((i) => `${i.path}: ${i.message}`);

void test("kinetic validation: order in frames, span, icons, duplicate keys, expand target", () => {
  assert.deepEqual(paths([{ at: "20f", text: "a" }, { at: "10f", text: "b" }]), ["scenes.0.layers.0.states.1.at: kinetic states must be in time order"]);
  assert.deepEqual(paths([{ at: 0, text: "a" }, { at: "2s", text: "b" }]), ["scenes.0.layers.0.states.1.at: kinetic state starts at or after the layer end"]);
  assert.match(paths([{ at: 0, text: "go {nope}" }])[0]!, /unknown icon: nope/);
  assert.match(paths([{ at: 0, tokens: [{ text: "a", key: "k" }, { text: "b", key: "k" }] }])[0]!, /duplicate token key in one state: k/);
  assert.match(paths([{ at: 0, text: "x" }, { at: 0.5, text: "{globe}", expand: { token: "icon:globe#0" } }])[0]!, /expand names a token that is not on screen/);
  assert.deepEqual(paths([{ at: 0, text: "Open {globe}" }, { at: 0.5, text: "{globe}", expand: { token: "icon:globe#0" } }]), []);
});
