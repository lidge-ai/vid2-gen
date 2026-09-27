/** In-place forward radix-2 FFT. Input length must be a power of two. */
export function fftRadix2(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n !== imag.length || n < 2 || (n & (n - 1)) !== 0) throw new RangeError("FFT length must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j]!, real[i]!]; [imag[i], imag[j]] = [imag[j]!, imag[i]!]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wr = Math.cos(angle); const wi = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = start + k; const b = a + len / 2;
        const tr = cr * real[b]! - ci * imag[b]!;
        const ti = cr * imag[b]! + ci * real[b]!;
        real[b] = real[a]! - tr; imag[b] = imag[a]! - ti;
        real[a] = real[a]! + tr; imag[a] = imag[a]! + ti;
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
}
