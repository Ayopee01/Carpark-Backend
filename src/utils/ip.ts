// Import Library
import ipaddr from 'ipaddr.js';

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่าเป็น IP เดี่ยวรูปแบบมาตรฐาน (IPv4 ต้องเป็นเลข 4 ส่วน ไม่รับรูปแบบย่ออย่าง 10.1 หรือเลขฐาน 16)
function isIpAddress(value: string): boolean {
  return ipaddr.IPv4.isValidFourPartDecimal(value) || ipaddr.IPv6.isValid(value);
}

// Function แยก IP หรือช่วง CIDR (เช่น 203.0.113.0/28) เป็นช่วงที่ใช้เทียบได้ คืน null เมื่อรูปแบบผิด (/0 ไม่รับเพราะเท่ากับไม่จำกัด IP)
// IP เดี่ยวแบบ IPv4-mapped (::ffff:10.0.0.5) เทียบเป็น IPv4 เหมือน IP ของ request
function parseIpRange(value: string): [ipaddr.IPv4 | ipaddr.IPv6, number] | null {
  const text = value.trim();
  if (isIpAddress(text)) {
    const address = ipaddr.process(text);
    return [address, address.kind() === 'ipv4' ? 32 : 128];
  }
  if (!ipaddr.IPv4.isValidCIDRFourPartDecimal(text) && !ipaddr.IPv6.isValidCIDR(text)) return null;

  const range = ipaddr.parseCIDR(text);
  return range[1] > 0 ? range : null;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลง IP ของ request ให้เทียบได้ (IPv4-mapped IPv6 เช่น ::ffff:10.0.0.5 เป็น 10.0.0.5) ค่าที่ไม่ใช่ IP คืนค่าเดิมที่ตัดช่องว่าง
function normalizeIp(ip: string | null | undefined): string {
  const text = String(ip || '').trim();
  return isIpAddress(text) ? ipaddr.process(text).toString() : text;
}

// Function ตรวจว่าเป็น IP เดี่ยวหรือช่วง CIDR ที่ใช้ใน allowedIps ได้
function isIpOrCidr(value: string): boolean {
  return parseIpRange(value) !== null;
}

// Function ตรวจว่า IP อยู่ในรายการ IP/CIDR ที่กำหนด (ค่าในรายการที่รูปแบบผิดหรือคนละ family ถูกข้าม)
function isIpInRanges(ip: string | null | undefined, ranges: string[]): boolean {
  const text = String(ip || '').trim();
  if (!isIpAddress(text)) return false;

  const address = ipaddr.process(text);
  return ranges.some((value) => {
    const range = parseIpRange(value);
    return range !== null && range[0].kind() === address.kind() && address.match(range);
  });
}

export { isIpInRanges, isIpOrCidr, normalizeIp };
