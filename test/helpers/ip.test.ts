// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Utils
import { isIpInRanges, isIpOrCidr } from '../../src/utils/ip';

/* -------------------------------------- Tests -------------------------------------- */

test('allowedIps accepts single IPs and CIDR ranges only', () => {
  assert.deepEqual(['10.0.0.5', '203.0.113.0/28', '2001:db8::/48', '::ffff:10.0.0.5'].map(isIpOrCidr), [true, true, true, true]);
  assert.deepEqual(['10.0.0.999', '0.0.0.0/0', '10.0.0.0/33', '10.0.0.0/', 'abc'].map(isIpOrCidr), [false, false, false, false, false]);
});

test('request IP matches single IPs, IPv4-mapped IPv6 and CIDR ranges', () => {
  const ranges = ['10.0.0.5', '203.0.113.0/28'];

  assert.equal(isIpInRanges('::ffff:10.0.0.5', ranges), true);
  assert.equal(isIpInRanges('203.0.113.15', ranges), true);
  assert.equal(isIpInRanges('203.0.113.16', ranges), false);
  assert.equal(isIpInRanges('', ranges), false);
  assert.equal(isIpInRanges('10.0.0.5', ['::ffff:10.0.0.5']), true);
});
