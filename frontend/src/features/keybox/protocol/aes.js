// AES-128-CBC with key = IV = aesKey, PKCS7 padding (WebCrypto default). Ported from ttlock-sdk-js AESUtil.
async function importKey(key, usage) {
  if (key.length !== 16) throw new Error('AES key must be 16 bytes')
  return crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, [usage])
}

export async function aesEncrypt(key, data) {
  const k = await importKey(key, 'encrypt')
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: key }, k, data))
}

export async function aesDecrypt(key, data) {
  const k = await importKey(key, 'decrypt')
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: key }, k, data))
}
