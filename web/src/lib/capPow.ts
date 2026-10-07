/**
 * Cap 人机验证的「算题」部分（和网鱼论坛 cap.js 同一个算法）：
 * 为每道题找一个十进制 nonce，使 sha256(盐 + nonce) 的十六进制以目标前缀开头。
 * 盐 24 位 + nonce 最多 10 位 = 34 字节，永远落在 SHA-256 的单个分组里，所以只写单分组压缩，
 * 而且只算哈希的第一个 32 位字（目标前缀最多 8 个十六进制位，一个字够比对），比通用实现快得多。
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);
const W = new Uint32Array(64);
const bytes = new Uint8Array(64);

/** bytes 里放好消息（长度 len 字节，后面跟 0x80 和 0）时，算 SHA-256 的第一个 32 位字 */
function firstWord(len: number): number {
  let t1: number;
  let t2: number;
  let s0: number;
  let s1: number;
  for (let i = 0; i < 16; i++) {
    W[i] = (bytes[i * 4]! << 24) | (bytes[i * 4 + 1]! << 16) | (bytes[i * 4 + 2]! << 8) | bytes[i * 4 + 3]!;
  }
  W[15] = len * 8;
  for (let i = 16; i < 64; i++) {
    s0 =
      ((W[i - 15]! >>> 7) | (W[i - 15]! << 25)) ^
      ((W[i - 15]! >>> 18) | (W[i - 15]! << 14)) ^
      (W[i - 15]! >>> 3);
    s1 =
      ((W[i - 2]! >>> 17) | (W[i - 2]! << 15)) ^
      ((W[i - 2]! >>> 19) | (W[i - 2]! << 13)) ^
      (W[i - 2]! >>> 10);
    W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0;
  }
  let a = 0x6a09e667;
  let b = 0xbb67ae85;
  let c = 0x3c6ef372;
  let d = 0xa54ff53a;
  let e = 0x510e527f;
  let f = 0x9b05688c;
  let g = 0x1f83d9ab;
  let h = 0x5be0cd19;
  for (let i = 0; i < 64; i++) {
    s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    t1 = (h + s1 + ((e & f) ^ (~e & g)) + K[i]! + W[i]!) | 0;
    s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  return (0x6a09e667 + a) >>> 0;
}

/** 为一道题找最小的 nonce；超过 10 位还没找到返回 -1（难度 6 以内实际碰不到） */
export function solveCapItem(salt: string, target: string): number {
  const saltLen = salt.length;
  const want = Number.parseInt(target, 16);
  const shift = 32 - 4 * target.length;
  bytes.fill(0);
  for (let i = 0; i < saltLen; i++) bytes[i] = salt.charCodeAt(i);
  // nonce 的十进制数位，高位在前，像里程表一样自增（不用每次拼字符串）
  const digits = new Uint8Array(12);
  let len = 1;
  digits[0] = 48;
  for (;;) {
    for (let i = 0; i < len; i++) bytes[saltLen + i] = digits[i]!;
    bytes[saltLen + len] = 0x80;
    if (firstWord(saltLen + len) >>> shift === want) {
      let n = 0;
      for (let i = 0; i < len; i++) n = n * 10 + (digits[i]! - 48);
      return n;
    }
    let i = len - 1;
    while (i >= 0 && digits[i]! === 57) {
      digits[i] = 48;
      i--;
    }
    if (i >= 0) {
      digits[i] = digits[i]! + 1;
    } else {
      len++;
      for (let j = 0; j < len; j++) digits[j] = 48;
      digits[0] = 49;
    }
    if (len > 10) return -1;
  }
}
