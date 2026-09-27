import assert from "node:assert/strict";
import { test } from "node:test";
import { fftRadix2 } from "./fft.ts";

void test("radix-2 FFT maps an impulse to a flat spectrum", () => {
  const real = new Float64Array(1024); const imag = new Float64Array(1024);
  real[0] = 1;
  fftRadix2(real, imag);
  for (let i = 0; i < real.length; i++) { assert.ok(Math.abs(real[i]! - 1) < 1e-9); assert.ok(Math.abs(imag[i]!) < 1e-9); }
});

void test("radix-2 FFT finds a sinusoid bin", () => {
  const real = Float64Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 32 * i / 1024));
  const imag = new Float64Array(1024);
  fftRadix2(real, imag);
  assert.ok(Math.hypot(real[32]!, imag[32]!) > 500);
  assert.ok(Math.hypot(real[31]!, imag[31]!) < 1e-6);
  assert.throws(() => fftRadix2(new Float64Array(100), new Float64Array(100)), RangeError);
});
