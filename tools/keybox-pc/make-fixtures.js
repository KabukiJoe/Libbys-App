'use strict';
// Generates frontend/src/features/keybox/protocol/__fixtures__/frames.json using the SDK's OWN encoders
// (CommandEnvelope / Command.build / AESUtil / CodecUtils) with SYNTHETIC lock data. No Bluetooth needed.
// The synthetic keys below are obviously fake. Never put real lockData here.
const fs = require('fs');
const path = require('path');
const sdk = require('ttlock-sdk-js');
const { CommandEnvelope, CommandType, CommandResponse } = sdk;
const { LockType } = require('ttlock-sdk-js/dist/constant/Lock');
const { AESUtil } = require('ttlock-sdk-js/dist/util/AESUtil');
const { CodecUtils } = require('ttlock-sdk-js/dist/util/CodecUtils');

const OUT = path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'keybox', 'protocol', '__fixtures__', 'frames.json');

// ---- synthetic lock data (same shape as the SDK's getLockData()) ----
const AES_KEY_HEX = '00112233445566778899aabbccddeeff';
const ADMIN_PS = 0x01020304;
const UNLOCK_KEY = 0x05060708;
const PS_FROM_LOCK = 0x0a0b0c0d; // the "random" the lock would return from checkUserTime/checkAdmin
const FIXED_UNIX = 1767225600;   // 2026-01-01T00:00:00Z, freezes moment().unix() inside unlock/lock build()
const LOCK_TYPE = LockType.LOCK_TYPE_V3;
const LOCK_TYPE_NAME = 'LOCK_TYPE_V3';

const lockData = {
  address: 'AA:BB:CC:DD:EE:FF',
  battery: 90,
  rssi: -60,
  autoLockTime: 5,
  lockedStatus: 0,
  privateData: {
    aesKey: AES_KEY_HEX,
    admin: { adminPs: ADMIN_PS, unlockKey: UNLOCK_KEY },
    adminPasscode: '1234567',
    pwdInfo: [],
  },
};
const aesKey = Buffer.from(AES_KEY_HEX, 'hex');

const realNow = Date.now;
Date.now = () => FIXED_UNIX * 1000;

const hex = (b) => Buffer.from(b).toString('hex');
const frames = [];

function request(name, description, commandType, configure, input) {
  const env = CommandEnvelope.createFromLockType(LOCK_TYPE, aesKey);
  env.setCommandType(commandType);
  const cmd = env.getCommand();
  if (configure) configure(cmd);
  const bytes = env.buildCommandBuffer();
  // sanity: the SDK must be able to parse what it just built, with a good CRC
  const back = CommandEnvelope.createFromRawData(bytes, aesKey);
  if (!back.isCrcOk() || back.getCommandType() !== commandType) throw new Error('self-check failed for ' + name);
  const bodyLen = bytes[11];
  frames.push({
    name, kind: 'request', description, lockData,
    input: { lockType: LOCK_TYPE_NAME, commandType, ...input },
    bytesHex: hex(bytes),
    // what is actually written to GATT fff2: envelope + CRLF, split into 20-byte chunks
    wireHex: hex(bytes) + '0d0a',
    aesEncrypted: bodyLen > 0,
    // decrypted body (AES-128-CBC, key = iv = aesKey), empty for body-less commands
    plaintextHex: bodyLen > 0 ? hex(back.getData()) : '',
  });
}

function response(name, description, commandType, responseCode, payload, decodedFields) {
  const plaintext = Buffer.concat([Buffer.from([commandType, responseCode]), payload]);
  const env = CommandEnvelope.createFromLockType(LOCK_TYPE, aesKey);
  // A lock reply uses the same envelope layout as a request; build it with the SDK primitives.
  const enc = AESUtil.aesEncrypt(plaintext, aesKey);
  const org = Buffer.alloc(4);
  org.writeInt16BE(env.organization, 0);
  org.writeInt16BE(env.sub_organization, 2);
  let frame = Buffer.concat([
    env.header,
    Buffer.from([env.protocol_type, env.sub_version, env.scene]),
    org,
    // Real boxes put COMM_RESPONSE (0x54) in the envelope; the answered command is the first plaintext byte.
    // Observed on the PAIRIER box (2026-11-18): reply to CheckUserTime had envelope 0x54, plaintext[0] 0x55.
    Buffer.from([CommandType.COMM_RESPONSE, env.encrypt, enc.length]),
    enc,
  ]);
  frame = Buffer.concat([frame, Buffer.from([CodecUtils.crccompute(frame)])]);
  // decode with the SDK, exactly like TTBluetoothDevice.readDeviceResponse + the TTLockApi callers
  const parsed = CommandEnvelope.createFromRawData(frame, aesKey);
  if (!parsed.isCrcOk()) throw new Error('crc failed for ' + name);
  const cmd = parsed.getCommand();
  if (cmd.getResponse() !== responseCode) throw new Error('response code mismatch for ' + name);
  frames.push({
    name, kind: 'response', description, lockData,
    input: { lockType: LOCK_TYPE_NAME, commandType, responseCode },
    bytesHex: hex(frame),
    wireHex: hex(frame) + '0d0a',
    expected: {
      command: cmd.constructor.name,
      commandType,
      response: responseCode,
      responseName: responseCode === CommandResponse.SUCCESS ? 'SUCCESS' : 'FAILED',
      dataHex: hex(payload),
      plaintextHex: hex(plaintext),
      ...decodedFields,
    },
  });
}

// 1. plain: empty body, so no AES at all (only envelope + CRC)
request('plain-init', 'Command with empty body: not encrypted, just envelope + CRC', CommandType.COMM_INITIALIZATION, null, {});
// 2. AES-encrypted commands
request('aes-check-user-time', 'COMM_CHECK_USER_TIME; first step of lock()/unlock() in the SDK', CommandType.COMM_CHECK_USER_TIME,
  (c) => c.setPayload(0, '0001311400', '9911301400', 0), { startDate: '0001311400', endDate: '9911301400', uid: 0, lockFlagPos: 0 });
request('check-admin', 'COMM_CHECK_ADMIN; first step of macro_adminLogin()', CommandType.COMM_CHECK_ADMIN,
  (c) => c.setParams(ADMIN_PS), { adminPs: ADMIN_PS });
request('check-random', 'COMM_CHECK_RANDOM; second step of macro_adminLogin()', CommandType.COMM_CHECK_RANDOM,
  (c) => c.setSum(PS_FROM_LOCK, UNLOCK_KEY), { psFromLock: PS_FROM_LOCK, unlockKey: UNLOCK_KEY, sum: PS_FROM_LOCK + UNLOCK_KEY });
request('unlock', 'COMM_UNLOCK; body = u32be(psFromLock+unlockKey) + u32be(unix time, frozen)', CommandType.COMM_UNLOCK,
  (c) => c.setSum(PS_FROM_LOCK, UNLOCK_KEY),
  { psFromLock: PS_FROM_LOCK, unlockKey: UNLOCK_KEY, sum: PS_FROM_LOCK + UNLOCK_KEY, unixTime: FIXED_UNIX });
request('lock', 'COMM_FUNCTION_LOCK; same body layout as unlock', CommandType.COMM_FUNCTION_LOCK,
  (c) => c.setSum(PS_FROM_LOCK, UNLOCK_KEY),
  { psFromLock: PS_FROM_LOCK, unlockKey: UNLOCK_KEY, sum: PS_FROM_LOCK + UNLOCK_KEY, unixTime: FIXED_UNIX });

// 3. responses from the lock
const ps = Buffer.alloc(4);
ps.writeUInt32BE(PS_FROM_LOCK);
response('response-check-user-time-ok', 'Success response carrying psFromLock', CommandType.COMM_CHECK_USER_TIME, 1, ps, { psFromLock: PS_FROM_LOCK });

const done = Buffer.alloc(15);
done.writeUInt8(88, 0);            // battery
done.writeUInt32BE(1, 1);          // uid
done.writeUInt32BE(2, 5);          // uniqueid
[26, 1, 1, 0, 0, 5].forEach((v, i) => done.writeUInt8(v, 9 + i)); // 2026-01-01 00:00:05
const doneFields = { batteryCapacity: 88, uid: 1, uniqueid: 2, dateTime: '260101000005' };
response('response-unlock-ok', 'Success response to unlock: battery, uid, uniqueid, yymmddhhmmss', CommandType.COMM_UNLOCK, 1, done, doneFields);
response('response-lock-ok', 'Success response to lock', CommandType.COMM_FUNCTION_LOCK, 1, done, doneFields);

// 4. failures (non-success response code; the SDK throws "Failed ... response")
response('response-unlock-failed', 'Lock replied FAILED (0) to unlock, no payload', CommandType.COMM_UNLOCK, 0, Buffer.alloc(0), {});
response('response-lock-failed', 'Lock replied FAILED (0) to lock, no payload', CommandType.COMM_FUNCTION_LOCK, 0, Buffer.alloc(0), {});
response('response-check-user-time-failed', 'Lock replied FAILED (0) to check-user-time', CommandType.COMM_CHECK_USER_TIME, 0, Buffer.alloc(0), {});

Date.now = realNow;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(frames, null, 2) + '\n');
console.log(`Wrote ${frames.length} frames to ${OUT}`);
