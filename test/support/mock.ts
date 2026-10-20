// Import Library
import type { TestContext } from 'node:test';

/* -------------------------------------- Types -------------------------------------- */

// Type mock ของ function: parameter ตาม signature จริง ส่วนค่าที่คืนไม่บังคับรูปแบบ (mock คืนข้อมูลบางส่วนได้)
type MockOf<T> = T extends (...args: infer TArgs) => unknown ? (...args: TArgs) => unknown : T;

// Type ค่าที่ใช้แทน property ของ module หรือ object
type Overrides<T> = { [K in keyof T]?: MockOf<T[K]> };

// Type context ของ test ที่ใช้ลงทะเบียน cleanup
type CleanupContext = Pick<TestContext, 'after'>;

/* -------------------------------------- Functions -------------------------------------- */

// Function แทน property ของ module/object แล้วคืน function ที่คืนค่าเดิม (ใช้กับ namespace import ที่ TypeScript กำหนดเป็น read-only)
function replace<T extends object>(target: T, overrides: Overrides<T>): () => void {
  const mutable = target as Record<keyof T, unknown>;
  const keys = Object.keys(overrides) as (keyof T)[];
  const originals = keys.map((key) => [key, mutable[key]] as const);
  keys.forEach((key) => {
    mutable[key] = overrides[key];
  });
  return () => originals.forEach(([key, value]) => {
    mutable[key] = value;
  });
}

// Function แทน property ของ module/object ชั่วคราวและคืนค่าเดิมตอนจบ test
function stub<T extends object>(t: CleanupContext, target: T, overrides: Overrides<T>): void {
  t.after(replace(target, overrides));
}

// Function ตั้ง env ชั่วคราวและคืนค่าเดิมตอนจบ test (undefined คือลบ env นั้น)
function setEnv(t: CleanupContext, values: Record<string, string | undefined>): void {
  const originals = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const apply = (entries: Record<string, string | undefined>): void => {
    Object.entries(entries).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  };
  apply(values);
  t.after(() => apply(originals));
}

// Function ใช้ข้อมูลทดสอบที่มีเฉพาะ field ที่ test ต้องใช้เป็น type เต็ม (ตั้งใจให้ไม่ครบทุก field)
function fixture<T>(value: object): T {
  return value as T;
}

export { fixture, replace, setEnv, stub };
export type { CleanupContext, MockOf, Overrides };
