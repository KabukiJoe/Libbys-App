'use strict';
// Lock the paired box (reads lockData.json). Touch the keypad first to wake it.
const { withPairedLock } = require('./common');
withPairedLock((lock) => lock.lock());
