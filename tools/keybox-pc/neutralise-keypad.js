'use strict';
// Step 6: make the keypad useless. Clears all stored passcodes and replaces the admin passcode
// with a random one that is deliberately never printed or saved.
const crypto = require('crypto');
const { withPairedLock } = require('./common');

withPairedLock(async (lock) => {
  const before = await lock.getPassCodes();
  console.log('Passcodes before:', before.length);
  const cleared = await lock.clearPassCodes();
  console.log('clearPassCodes:', cleared);
  // setAdminKeyboardPwdCommand is protected in the typings but callable at runtime.
  let code = '';
  for (let i = 0; i < 7; i++) code += crypto.randomInt(0, 10);
  await lock.setAdminKeyboardPwdCommand(code);
  code = null; // never recorded
  console.log('Admin passcode replaced with an unrecorded random code.');
  const after = await lock.getPassCodes();
  console.log('Passcodes after:', after.length, '(expect 0)');
  return cleared && after.length === 0;
});
