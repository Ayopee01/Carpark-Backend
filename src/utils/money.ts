// Import Library
import Decimal from 'decimal.js';

/* -------------------------------------- Config -------------------------------------- */

// Config Decimal สำหรับเงินบาท ปัดครึ่งขึ้น (0.005 → 0.01) แยกจาก Decimal กลางเพื่อไม่กระทบ library อื่น
const Money = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP });

// Config จำนวนทศนิยมของเงินบาท และจำนวนสตางค์ต่อบาท (Omise ใช้หน่วยสตางค์)
const MONEY_DECIMAL_PLACES = 2;
const SATANG_PER_BAHT = 100;

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลงค่าเป็น Decimal (ค่าที่ไม่ใช่ตัวเลขนับเป็น 0)
function toMoney(value: unknown): Decimal {
  const number = Number(value);
  return new Money(Number.isFinite(number) ? number : 0);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ปัดยอดเงินเป็นทศนิยม 2 ตำแหน่ง
function roundMoney(value: unknown): number {
  return toMoney(value).toDecimalPlaces(MONEY_DECIMAL_PLACES).toNumber();
}

// Function รวมยอดเงินหลายรายการแบบไม่มีเศษ floating point แล้วปัด 2 ตำแหน่ง
function sumMoney(values: unknown[]): number {
  return values.reduce<Decimal>((total, value) => total.plus(toMoney(value)), new Money(0)).toDecimalPlaces(MONEY_DECIMAL_PLACES).toNumber();
}

// Function ลบยอดเงิน (a - b) แล้วปัด 2 ตำแหน่ง
function subtractMoney(a: unknown, b: unknown): number {
  return toMoney(a).minus(toMoney(b)).toDecimalPlaces(MONEY_DECIMAL_PLACES).toNumber();
}

// Function คูณยอดเงินกับจำนวน (เช่น ราคาต่อชั่วโมง x ชั่วโมง) แล้วปัด 2 ตำแหน่ง
function multiplyMoney(amount: unknown, quantity: unknown): number {
  return toMoney(amount).times(toMoney(quantity)).toDecimalPlaces(MONEY_DECIMAL_PLACES).toNumber();
}

// Function แปลงบาทเป็นสตางค์ (จำนวนเต็ม)
function toSatang(amount: unknown): number {
  return toMoney(amount).times(SATANG_PER_BAHT).toDecimalPlaces(0).toNumber();
}

// Function แปลงสตางค์เป็นบาท
function fromSatang(amount: unknown): number {
  return toMoney(amount).dividedBy(SATANG_PER_BAHT).toDecimalPlaces(MONEY_DECIMAL_PLACES).toNumber();
}

// Function ตรวจว่ายอดเงินมีทศนิยมไม่เกิน 2 ตำแหน่ง
function hasMoneyPrecision(value: unknown): boolean {
  return toMoney(value).decimalPlaces() <= MONEY_DECIMAL_PLACES;
}

export { fromSatang, hasMoneyPrecision, multiplyMoney, roundMoney, subtractMoney, sumMoney, toSatang };
