import { randomBytes, scrypt as nodeScrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';
const N = 16_384;
const r = 8;
const p = 1;
const keyLength = 64;

function scrypt(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, keyLength, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, nValue, rValue, pValue, saltValue, hashValue] = stored.split('$');
  if (algorithm !== 'scrypt' || !nValue || !rValue || !pValue || !saltValue || !hashValue) return false;

  const expected = Buffer.from(hashValue, 'base64');
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64'), expected.length, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

