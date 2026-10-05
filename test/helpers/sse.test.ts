// Import Library
import assert from 'node:assert/strict';
import { test } from 'node:test';
// Import Utils
import { createQueuedTask } from '../../src/realtime/sse';

/* -------------------------------------- Tests -------------------------------------- */

test('createQueuedTask reruns once with latest args when called during a run', async () => {
  const calls: string[] = [];
  let release: () => void = () => {};
  const task = createQueuedTask(async (value: string) => {
    calls.push(value);
    if (value === 'first') await new Promise<void>((resolve) => { release = resolve; });
  });

  // เรียกซ้อนระหว่างงานแรกยังไม่เสร็จ ต้องไม่หาย และรันเฉพาะค่าล่าสุด
  const first = task('first');
  void task('second');
  void task('third');
  release();
  await first;

  assert.deepEqual(calls, ['first', 'third']);
});
