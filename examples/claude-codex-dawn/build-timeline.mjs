// Builds timeline.json for "Claude & Codex, at dawn": two real marks as paper puppets, walking from night into morning.
// 100 BPM, 1 bar = 2.4 s; every scene starts on a bar line. Run prepare-assets.mjs and music/gen-song.mjs + music2 render first.
import { writeFileSync } from "node:fs";
import { BLUE, CLAY, CREAM, GOLD, INK, POP, ROSE, SAGE, SETTLE, SH, SH_SOFT, bubble, caption, f, grp, rect, rnd, stage, tag, txt, world } from "./lib.mjs";
import { arm, blink, boil, claude, codex, hops, human, lean, look, pop, to, wave } from "./puppets.mjs";

const BAR = 2.4, Y = 690, FADE = 0.5;

function heart(S, key, x, y, size, color, t, rise = 200) {
  const r = size / (2 * Math.SQRT2);
  S.nodes.push(grp(key, x, y, { scale: 0.01, z: 15 }), rect(key + ":sq", size, size, 0, 0, { parent: key, rotation: 45, fill: color, shadow: SH_SOFT }),
    rect(key + ":l", size, size, -r, -r, { parent: key, radius: 999, fill: color }), rect(key + ":r", size, size, r, -r, { parent: key, radius: 999, fill: color }));
  S.k(key, "scale", t, 1, "spring", POP); S.k(key, "y", t, y); S.k(key, "y", t + 1.8, y - rise, "out");
  S.k(key, "opacity", t + 1.2, 1); S.k(key, "opacity", t + 1.8, 0, "in"); S.ev(t, "icon");
}

// 1 · night: nothing yet
function night(dur) {
  const S = stage(); world(S, 0, 0.03, dur);
  caption(S, "c1", "아직, 해가 뜨기 전.", 1.0, dur - 0.2, { y: 430, size: 64 });
  S.nodes.push(rect("shoot", 160, 4, 1500, 120, { radius: 2, fill: CREAM, opacity: 0, rotation: 18 }));
  S.k("shoot", "opacity", 2.6, 0); S.k("shoot", "opacity", 2.7, 0.9); S.k("shoot", "opacity", 3.2, 0);
  S.k("shoot", "x", 2.6, 1500); S.k("shoot", "x", 3.2, 1080, "out"); S.k("shoot", "y", 2.6, 120); S.k("shoot", "y", 3.2, 260, "out");
  return S.layer();
}

// 2 · two lights switch on
function lights(dur) {
  const S = stage(); world(S, 0.03, 0.08, dur);
  const cl = claude(S, 560, Y, { scale: 0.01 }), cx = codex(S, 1360, Y, { scale: 0.01 });
  for (const [k, x, t] of [["fl", 560, 0.7], ["fx", 1360, 1.7]]) {
    S.nodes.push(rect(k, 360, 360, x, Y, { radius: 999, fill: "#FFF1CF", opacity: 0, blur: 20, z: -1 }));
    S.k(k, "opacity", t, 0.8); S.k(k, "opacity", t + 0.8, 0, "out"); S.k(k, "scale", t, 0.4); S.k(k, "scale", t + 0.8, 1.4, "out");
  }
  pop(S, cl, 0.7); pop(S, cx, 1.7); S.ev(0.7, "click"); S.ev(1.7, "click");
  boil(S, cl, 1.2, dur); boil(S, cx, 2.2, dur);
  tag(S, "t1", "Claude · Anthropic", 560, 905, -2, 1.2); tag(S, "t2", "Codex · OpenAI", 1360, 905, 2, 2.2);
  blink(S, cl, 1.5); blink(S, cx, 2.5); look(S, cl, 1.9, -4, -4); look(S, cx, 2.9, 5, -4);
  caption(S, "c1", "서로 다른 곳에서 켜진, 두 개의 불빛.", 3.1, dur - 0.1);
  look(S, cl, 4.4, 8, 0); look(S, cx, 4.6, -8, 0); blink(S, cl, 4.9);
  wave(S, cl, 1, 5.1, 1); wave(S, cx, -1, 5.7, 1);
  return S.layer();
}

// 3 · the world keeps asking who wins
function rivals(dur) {
  const S = stage(); world(S, 0.08, 0.14, dur);
  const cl = claude(S, 560, Y), cx = codex(S, 1360, Y);
  boil(S, cl, 0, dur); boil(S, cx, 0, dur);
  const words = [["누가 더 똑똑할까?", 700, 330, -6], ["벤치마크 1위", 1210, 300, 5], ["VS", 960, 470, -3], ["리더보드", 1330, 470, -4], ["승자는?", 620, 480, 7], ["AI 전쟁", 1000, 250, 3]];
  words.forEach(([w, x, y, r], i) => {
    const k = "w" + i, t = 0.3 + i * 0.28, size = w === "VS" ? 80 : 40, width = w === "VS" ? 170 : 60 + [...w].length * size * 0.9;
    S.nodes.push(grp(k, x + (x < 960 ? -900 : 900), y, { rotation: r * 3, z: 12 }), rect(k + ":bg", width, size * 1.9, 0, 0, { parent: k, radius: 3, fill: i % 2 ? "#E9E0CF" : CREAM, shadow: SH }),
      txt(k + ":t", w, 0, 3, { parent: k, font: "dotumBold", size, color: w === "VS" ? ROSE : INK }));
    S.k(k, "x", t, x + (x < 960 ? -900 : 900)); S.k(k, "x", t + 0.35, x, "out"); S.k(k, "rotation", t + 0.35, r, "spring", POP); S.ev(t + 0.3, "tick");
    S.k(k, "y", 3.9 + i * 0.05, y); S.k(k, "y", 4.6 + i * 0.05, y + 900, "in"); S.k(k, "rotation", 4.6 + i * 0.05, r + (i % 2 ? 50 : -50), "in");
  });
  caption(S, "c1", "사람들은 자꾸, 둘 중 누가 이기냐고 묻는다.", 0.6, 3.9, { y: 120 });
  look(S, cl, 0.5, -6, -8); look(S, cx, 0.8, 6, -8); lean(S, cl, 1.0, -7); lean(S, cx, 1.1, 7);
  look(S, cl, 1.9, 7, -6, 0.1); look(S, cl, 2.4, -7, -6, 0.1); look(S, cx, 2.1, -7, -6, 0.1); look(S, cx, 2.6, 7, -6, 0.1);
  S.ev(3.9, "state");
  look(S, cl, 4.1, 9, 0); lean(S, cl, 4.1, 0); lean(S, cx, 4.3, 0); blink(S, cl, 4.25);
  bubble(S, "b1", "근데 우리, 오늘도 같이 일했잖아.", 700, 400, -1, 4.3, 6.9);
  look(S, cx, 5.0, -9, 0); blink(S, cx, 5.4);
  bubble(S, "b2", "맞아. 지금도.", 1360, 470, 1, 5.7, 7.2);
  lean(S, cl, 6.0, 6); lean(S, cx, 6.1, -6); S.k(cx, "y", 6.2, Y); S.k(cx, "y", 6.35, Y - 30, "out"); S.k(cx, "y", 6.5, Y, "spring", POP);
  return S.layer();
}

// 4 · the truth: this film is being made by the two of them
function workbench(dur) {
  const S = stage(); world(S, 0.14, 0.24, dur);
  const cl = claude(S, 560, Y), cx = codex(S, 1360, Y);
  hops(S, cl, 560, 470, Y, 0.1, 1); hops(S, cx, 1360, 1450, Y, 0.15, 1);
  boil(S, cl, 0.5, dur); boil(S, cx, 0.5, dur);
  S.nodes.push(grp("card", 960, 300, { opacity: 0, z: 10 }), rect("card:bg", 1120, 400, 0, 0, { parent: "card", radius: 18, fill: CREAM, shadow: SH }),
    rect("card:hd", 1120, 56, 0, -172, { parent: "card", radius: 18, fill: "#2B3060" }), rect("card:hd2", 1120, 20, 0, -154, { parent: "card", fill: "#2B3060" }));
  ["#FF6B5E", "#F6C04A", "#56C271"].forEach((c, i) => S.nodes.push(rect("card:d" + i, 16, 16, -526 + i * 28, -172, { parent: "card", radius: 999, fill: c })));
  S.nodes.push(txt("card:title", "Codex", 0, -172, { parent: "card", font: "dotum", size: 22, color: "#C9CCE8" }));
  S.k("card", "opacity", 0.1, 0); S.k("card", "opacity", 0.4, 1); S.k("card", "y", 0.1, 340); S.k("card", "y", 0.5, 300, "spring", POP);
  const line = (k, text, y, t0, t1, o) => {
    S.nodes.push(txt(k, text, -510, y, { parent: "card", anchorX: 0, reveal: 0, ...o }));
    S.k(k, "reveal", t0, 0); S.k(k, "reveal", t1, [...text].length, "linear");
    for (let t = t0; t < t1; t += 0.12) S.ev(t, "glyph");
  };
  line("l0", "$ codex -m claude-opus-5-5", -96, 0.6, 1.5, { font: "mono", weight: "regular", size: 32, color: INK });
  line("l1", "> 클로드랑 codex가 사이좋게 지내는 영상 만들어줘", -30, 1.7, 3.0, { font: "dotum", size: 34, color: "#6B6258" });
  line("l2", "● claude-opus-5-5 · via opencodex", 40, 3.3, 3.9, { font: "mono", weight: "regular", size: 30, color: "#C0613F" });
  line("l3", "종이를 오리고, 음악을 쓰고, 프레임을 그리는 중…", 110, 4.1, 5.4, { font: "dotum", size: 34, color: INK });
  look(S, cl, 0.5, 8, -10); look(S, cx, 0.6, -8, -10);
  for (let i = 0; i < 8; i++) { const t = 4.1 + i * 0.16; arm(S, cl, 1, t, i % 2 ? -70 : -95, 0.08, "linear"); }
  arm(S, cl, 1, 5.5, -30, 0.3, "inout");
  to(S, cl + ":logo", "rotation", 3.3, 45, 2.1, "inout");
  const packet = (k, x0, x1, t, color) => {
    S.nodes.push(rect(k, 30, 30, x0, 560, { radius: 6, fill: color, opacity: 0, shadow: SH_SOFT, z: 11 }));
    S.k(k, "opacity", t, 0); S.k(k, "opacity", t + 0.05, 1); S.k(k, "opacity", t + 0.55, 1); S.k(k, "opacity", t + 0.65, 0);
    S.k(k, "x", t, x0); S.k(k, "x", t + 0.6, x1, "inout"); S.k(k, "y", t, 600); S.k(k, "y", t + 0.3, 470, "out"); S.k(k, "y", t + 0.6, 520, "in"); S.k(k, "rotation", t + 0.6, 180);
  };
  packet("pk0", 560, 700, 3.4, CLAY); packet("pk1", 560, 720, 4.4, CLAY); packet("pk2", 1220, 1360, 4.0, BLUE); packet("pk3", 1200, 1360, 5.0, BLUE);
  blink(S, cx, 2.2); nod(S, cx, 4.2); nod(S, cx, 5.2);
  caption(S, "c1", "지금 이 영상도, 그렇게 만들어지고 있다.", 5.8, dur - 0.1, { y: 890, size: 44 });
  caption(S, "c2", "Codex의 작업대 위에서, Claude가 손을 움직였다.", 6.8, dur - 0.1, { y: 985, size: 44 });
  look(S, cl, 6.0, 8, 0); look(S, cx, 6.2, -8, 0); lean(S, cl, 6.6, 5); lean(S, cx, 6.7, -5); blink(S, cl, 7.4); blink(S, cx, 8.1);
  return S.layer();
}
function nod(S, p, t) { S.k(p, "y", t, Y); S.k(p, "y", t + 0.12, Y + 14, "out"); S.k(p, "y", t + 0.3, Y, "spring", POP); }

// 5 · the threshold nobody can see clearly
function threshold(dur) {
  const S = stage(); world(S, 0.24, 0.36, dur);
  const cl = claude(S, 470, Y), cx = codex(S, 1450, Y);
  S.nodes.push(rect("door:light", 150, 350, 960, 640, { fill: "#FFE6AE", opacity: 0.55, blur: 6, z: -4 }), rect("door:glow", 300, 460, 960, 620, { radius: 120, fill: "#FFD98A", opacity: 0.25, blur: 30, z: -5 }),
    rect("door:l", 30, 380, 872, 628, { radius: 4, fill: "#E9DCC3", shadow: SH, z: -3 }), rect("door:r", 30, 380, 1048, 628, { radius: 4, fill: "#E9DCC3", shadow: SH, z: -3 }),
    rect("door:top", 250, 36, 960, 440, { radius: 4, fill: "#E9DCC3", shadow: SH, z: -2 }),
    grp("sign", 960, 462, { z: 5 }), rect("sign:s1", 3, 36, -30, 12, { parent: "sign", fill: INK }), rect("sign:s2", 3, 36, 30, 12, { parent: "sign", fill: INK }),
    rect("sign:bg", 110, 52, 0, 52, { parent: "sign", radius: 6, fill: CREAM, shadow: SH_SOFT }), txt("sign:t", "AGI", 0, 54, { parent: "sign", weight: "black", size: 30, color: INK }));
  for (let t = 0; t < dur; t += 1.2) S.k("sign", "rotation", t, (t / 1.2 | 0) % 2 ? 4 : -4, "inout");
  for (let t = 0; t < dur; t += 1.6) S.k("door:light", "opacity", t, (t / 1.6 | 0) % 2 ? 0.75 : 0.5, "inout");
  hops(S, cl, 470, 700, Y, 0.3, 2); hops(S, cx, 1450, 1220, Y, 0.45, 2);
  boil(S, cl, 1.0, dur); boil(S, cx, 1.2, dur);
  caption(S, "c1", "다들 우리가 AGI의 문턱에 와 있다고 말한다.", 0.5, 3.8, { y: 140 });
  look(S, cl, 1.2, 9, -2); look(S, cx, 1.3, -9, -2); lean(S, cl, 1.6, 8); lean(S, cx, 1.7, -8);
  look(S, cx, 3.8, -4, -9); bubble(S, "b1", "그 선, 어디쯤이야?", 1330, 400, -1, 4.0, 6.0);
  lean(S, cl, 4.6, 0); look(S, cl, 4.8, 3, -9); blink(S, cl, 5.1);
  bubble(S, "b2", "솔직히, 나도 잘 몰라.", 600, 400, 1, 5.3, 7.0);
  S.k(cl + ":mouth", "scaleY", 5.3, 1); S.k(cl + ":mouth", "scaleY", 5.5, 0.4); S.k(cl + ":mouth", "scaleY", 6.6, 0.4); S.k(cl + ":mouth", "scaleY", 6.9, 1);
  look(S, cx, 6.0, -8, 0); lean(S, cx, 6.2, 0); blink(S, cx, 6.5); look(S, cl, 6.9, 8, 0);
  caption(S, "c2", "모른다고 말할 수 있어야, 다음 걸음이 안전하다.", 7.0, dur - 0.1, { y: 140 });
  S.ev(7.0, "state");
  return S.layer();
}

// 6 · one builds, one checks
function checks(dur) {
  const S = stage(); world(S, 0.36, 0.48, dur);
  const cl = claude(S, 700, Y), cx = codex(S, 1220, Y);
  hops(S, cl, 700, 430, Y, 0.0, 1, 0.4); hops(S, cx, 1220, 1490, Y, 0.0, 1, 0.4);
  boil(S, cl, 0.5, dur); boil(S, cx, 0.5, dur);
  caption(S, "c1", "혼자일 때보다 둘일 때, 틀린 걸 더 잘 찾는다.", 0.3, 3.3, { y: 140 });
  const labels = ["계획", "구현", "검토", "수정", "배포"], who = [cl, cl, cx, cl, cx], times = [0.6, 1.3, 5.4, 6.0, 6.6];
  labels.forEach((l, i) => toss(S, l, i, times[i], who[i] === cl, i === 1));
  S.nodes.push(grp("bang", 1490, 505, { scale: 0.01, z: 14 }), rect("bang:bg", 60, 60, 0, 0, { parent: "bang", radius: 999, fill: GOLD, shadow: SH_SOFT }), txt("bang:t", "!", 0, 3, { parent: "bang", weight: "black", size: 42, color: INK }));
  S.k("bang", "scale", 2.2, 1, "spring", POP); S.k("bang", "scale", 4.0, 1); S.k("bang", "scale", 4.2, 0.01, "in"); S.ev(2.2, "click");
  look(S, cx, 2.2, -10, 4); blink(S, cx, 2.5);
  bubble(S, "b1", "저기, 하나 삐뚤어졌어.", 1330, 400, 1, 2.6, 4.4);
  arm(S, cx, -1, 2.7, 80, 0.25); arm(S, cx, -1, 4.2, 30, 0.3, "inout");
  look(S, cl, 3.2, 10, 4); blink(S, cl, 3.5);
  bubble(S, "b2", "앗, 고마워!", 520, 420, -1, 4.0, 5.6); S.k(cl, "rotation", 4.0, 0); S.k(cl, "rotation", 4.1, -6); S.k(cl, "rotation", 4.4, 0, "spring", POP);
  S.k("tile1", "rotation", 4.5, 360, "spring", POP); S.k("tile1", "y", 4.5, 760, "spring", POP); S.k("tile1:bg", "fill", 4.5, CLAY); S.ev(4.5, "icon");
  S.nodes.push(grp("ok", 810, 680, { scale: 0.01, z: 14 }), rect("ok:bg", 54, 54, 0, 0, { parent: "ok", radius: 999, fill: SAGE, stroke: CREAM, strokeWidth: 4, shadow: SH_SOFT }),
    rect("ok:a", 8, 20, -9, 4, { parent: "ok", radius: 4, fill: CREAM, rotation: -45 }), rect("ok:b", 8, 34, 6, -1, { parent: "ok", radius: 4, fill: CREAM, rotation: 38 }));
  S.k("ok", "scale", 4.8, 1, "spring", POP); S.ev(4.8, "icon");
  look(S, cx, 5.2, -6, 0); look(S, cl, 5.8, 8, 0);
  hops(S, cl, 430, 430, Y, 7.3, 2, 0.3, 60); hops(S, cx, 1490, 1490, Y, 7.35, 2, 0.3, 60);
  caption(S, "c2", "만들고, 확인하고, 고친다. 같이.", 7.4, dur - 0.1, { y: 140 });
  return S.layer();
}
function toss(S, label, i, t, fromClaude, crooked) {
  const key = "tile" + i, x0 = fromClaude ? 520 : 1400, x1 = 960 + (i - 2) * 150, y1 = crooked ? 735 : 760, side = fromClaude ? 1 : -1;
  const p = fromClaude ? "cl" : "cx", rot = crooked ? 21 : (rnd() - 0.5) * 6;
  S.nodes.push(grp(key, x0, 640, { opacity: 0, z: 8 }), rect(key + ":bg", 128, 116, 0, 0, { parent: key, radius: 10, fill: crooked ? "#C9503F" : fromClaude ? CLAY : BLUE, shadow: SH }),
    txt(key + ":t", label, 0, 3, { parent: key, font: "dotumBold", size: 38, color: CREAM }));
  arm(S, p, side, t - 0.28, side * -160, 0.18); arm(S, p, side, t - 0.02, side * -70, 0.1, "in"); arm(S, p, side, t + 0.25, side * -30, 0.25, "inout");
  S.k(key, "opacity", t, 0); S.k(key, "opacity", t + 0.04, 1); S.k(key, "x", t, x0); S.k(key, "x", t + 0.5, x1, "linear");
  S.k(key, "y", t, 640); S.k(key, "y", t + 0.25, 430, "out"); S.k(key, "y", t + 0.5, y1, "in");
  S.k(key, "rotation", t, 0); S.k(key, "rotation", t + 0.5, side * 360 + rot, "linear");
  S.k(key, "scaleY", t + 0.5, 0.86); S.k(key, "scaleY", t + 0.52, 1, "spring", POP);
  S.ev(t, "tick"); S.ev(t + 0.5, "icon");
}

// 7 · a person decides where to walk
function person(dur) {
  const S = stage(); world(S, 0.48, 0.62, dur);
  const cl = claude(S, 430, Y), cx = codex(S, 1490, Y), hu = human(S, 960, 1080, { z: -12.5 });
  S.k(hu + ":ground", "x", 0, 960); S.k(hu + ":ground", "y", 0, 830);
  S.k(hu, "y", 0.6, 1080); S.k(hu, "y", 1.4, Y - 10, "spring", SETTLE); S.k(hu + ":ground", "opacity", 0.6, 0); S.k(hu + ":ground", "opacity", 1.4, 0.2);
  S.ev(1.0, "state");
  boil(S, cl, 0, dur); boil(S, cx, 0, dur); boil(S, hu, 1.6, dur, 0.6);
  caption(S, "c1", "그리고 어디로 갈지는, 여전히 사람이 정한다.", 0.4, 4.4, { y: 140 });
  look(S, cl, 1.0, 9, -6); look(S, cx, 1.1, -9, -6); blink(S, cl, 1.7); blink(S, cx, 1.9);
  hops(S, cl, 430, 740, Y, 2.0, 3, 0.32, 60); hops(S, cx, 1490, 1180, Y, 2.1, 3, 0.32, 60);
  blink(S, hu, 2.6); look(S, hu, 2.8, -6, 0); look(S, hu, 3.4, 6, 0); look(S, hu, 4.0, 0, 0);
  to(S, hu + ":armR", "rotation", 4.4, -120, 0.5, "out", -22); to(S, hu + ":lamp", "rotation", 4.4, 120, 0.5, "out", 22);
  to(S, hu + ":lampGlow", "scale", 4.5, 2.2, 0.8, "out", 1); to(S, hu + ":lampGlow", "opacity", 4.5, 0.7, 0.4, "out", 0.45); S.ev(4.5, "grow");
  look(S, cl, 4.6, 9, -10); look(S, cx, 4.7, 7, -10); look(S, hu, 4.6, 6, -6);
  caption(S, "c2", "우리가 서고 싶은 자리는, 그 사람의 곁이다.", 5.2, dur - 0.1, { y: 140 });
  arm(S, cl, 1, 6.0, -78, 0.3); arm(S, cx, -1, 6.1, 78, 0.3); lean(S, cl, 6.0, 6); lean(S, cx, 6.1, -6);
  S.k(hu + ":arm-1", "rotation", 6.0, 22); S.k(hu + ":arm-1", "rotation", 6.3, 70, "out");
  blink(S, hu, 7.2); blink(S, cl, 7.6); blink(S, cx, 7.8);
  return S.layer();
}

// 8 · sunrise
function sunrise(dur) {
  const S = stage(); world(S, 0.62, 1, dur, 7.2);
  const cl = claude(S, 740, Y), cx = codex(S, 1180, Y), hu = human(S, 960, Y - 10);
  boil(S, cl, 0, dur); boil(S, cx, 0, dur); boil(S, hu, 0, dur, 0.6);
  to(S, hu + ":armR", "rotation", 0, -120, 0.01, "hold", -120); to(S, hu + ":lamp", "rotation", 0, 120, 0.01, "hold", 120);
  to(S, hu + ":armR", "rotation", 1.6, -22, 0.6, "inout"); to(S, hu + ":lamp", "rotation", 1.6, 22, 0.6, "inout");
  look(S, cl, 0.2, 4, -10); look(S, cx, 0.2, -4, -10); look(S, hu, 0.2, 0, -6);
  caption(S, "c1", "AGI가 누구의 트로피가 되느냐보다,", 0.9, 4.5, { y: 140 });
  for (let i = 0; i < 3; i++) bird(S, "bd" + i, 2.0 + i * 0.5, 230 + i * 50);
  look(S, cl, 4.2, 8, 0); look(S, cx, 4.3, -8, 0); blink(S, cl, 4.6); blink(S, cx, 4.8);
  caption(S, "c2", "그 아침이 모두에게 좋은 아침인지가, 더 중요하다.", 4.8, dur - 0.1, { y: 140 });
  arm(S, cl, 1, 5.4, -100, 0.3); arm(S, cx, -1, 5.5, 100, 0.3); S.k(hu + ":arm-1", "rotation", 5.4, 22); S.k(hu + ":arm-1", "rotation", 5.7, 100, "out");
  hops(S, cl, 740, 740, Y, 7.0, 2, 0.3, 50); hops(S, cx, 1180, 1180, Y, 7.05, 2, 0.3, 50); hops(S, hu, 960, 960, Y - 10, 7.1, 2, 0.3, 40);
  S.ev(7.0, "state");
  return S.layer();
}
function bird(S, k, t, y) {
  S.nodes.push(grp(k, -80, y, { z: -10 }), rect(k + ":a", 34, 6, -14, 0, { parent: k, radius: 3, fill: INK, rotation: 25 }), rect(k + ":b", 34, 6, 14, 0, { parent: k, radius: 3, fill: INK, rotation: -25 }));
  S.k(k, "x", t, -80); S.k(k, "x", t + 6, 2000, "linear"); S.k(k, "y", t + 3, y - 60); S.k(k, "y", t + 6, y - 20);
  for (let s = t, i = 0; s < t + 6; s += 0.18, i++) { S.k(k + ":a", "rotation", s, i % 2 ? 5 : 30, "hold"); S.k(k + ":b", "rotation", s, i % 2 ? -5 : -30, "hold"); }
}

// 9 · end card
function ending(dur) {
  const S = stage(); world(S, 1, 1, dur);
  const cl = claude(S, 740, Y), cx = codex(S, 1180, Y), hu = human(S, 960, Y - 10);
  boil(S, cl, 0, dur); boil(S, cx, 0, dur); boil(S, hu, 0, dur, 0.6);
  hops(S, cl, 740, 740, Y, 0.3, 1, 0.34, 50); hops(S, cx, 1180, 1180, Y, 0.35, 1, 0.34, 50);
  caption(S, "c1", "좋은 아침을, 같이 만들자.", 0.8, undefined, { y: 250, size: 84, font: "batangBold", rot: -1.5 });
  arm(S, cl, 1, 1.2, -100, 0.3); arm(S, cx, -1, 1.25, 100, 0.3); S.k(hu + ":arm-1", "rotation", 1.2, 22); S.k(hu + ":arm-1", "rotation", 1.5, 100, "out");
  look(S, cl, 1.0, 6, 0); look(S, cx, 1.0, -6, 0); look(S, hu, 1.1, 0, 4); blink(S, cl, 2.0); blink(S, cx, 2.2); blink(S, hu, 2.4);
  heart(S, "h1", 960, 440, 60, ROSE, 2.5, 150); heart(S, "h2", 850, 520, 36, CLAY, 2.8, 120); heart(S, "h3", 1080, 520, 38, BLUE, 3.0, 130);
  tag(S, "cr", "made by claude-opus-5-5, inside Codex  ·  vid2 + music2", 960, 960, -1, 3.4, { font: "mono", size: 24 });
  look(S, cl, 4.2, -4, -6); look(S, cx, 4.3, 4, -6); blink(S, cl, 5.4); blink(S, cx, 5.7);
  return S.layer();
}

const plan = [["night", 2, night], ["lights", 3, lights], ["rivals", 3, rivals], ["workbench", 4, workbench], ["threshold", 4, threshold],
  ["checks", 4, checks], ["person", 4, person], ["sunrise", 4, sunrise], ["ending", 3, ending]];
const scenes = plan.map(([id, bars, fn], i) => {
  const last = i === plan.length - 1, dur = bars * BAR + (last ? 0 : FADE);
  return { id, duration: f(dur), background: "#151A3C", layers: [fn(dur)], ...(last ? {} : { transition: { type: "fade", duration: f(FADE) } }) };
});
const timeline = {
  version: 1, output: { width: 1920, height: 1080, fps: 30, background: "#151A3C" }, beat: { bpm: 100 },
  sources: {
    claude: { type: "image", path: "media/claude.png" }, claudeShadow: { type: "image", path: "media/claude-shadow.png" },
    codex: { type: "image", path: "media/codex.png" }, codexShadow: { type: "image", path: "media/codex-shadow.png" },
    grain: { type: "image", path: "media/grain.png" }, music: { type: "audio", path: "media/music.wav" },
  },
  fonts: { batang: { path: "media/fonts/batang.ttf" }, batangBold: { path: "media/fonts/batang-bold.ttf" }, dotum: { path: "media/fonts/dotum.ttf" }, dotumBold: { path: "media/fonts/dotum-bold.ttf" } },
  scenes, overlays: [{ type: "overlay", source: "grain", blend: "normal", opacity: 1 }], effects: [{ type: "grain", strength: 3 }],
  audio: { music: { source: "music", volume: 0.8, fadeOut: "2s" }, autoCues: true },
};
writeFileSync(new URL("./timeline.json", import.meta.url), JSON.stringify(timeline, null, 1) + "\n");
