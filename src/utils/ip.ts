// Import Library
import net from 'net';

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลง IP ของ request ให้เทียบได้ (ตัด prefix IPv4-mapped IPv6 เช่น ::ffff:10.0.0.5)
function normalizeIp(ip: string | null | undefined): string {
  return String(ip || '').trim().replace(/^::ffff:/i, '');
}

// Function แยก IP หรือช่วง CIDR (เช่น 203.0.113.0/28) คืน null เมื่อรูปแบบผิด (/0 ไม่รับเพราะเท่ากับไม่จำกัด IP)
function parseIpRange(value: string): { address: string; prefix: number; family: 'ipv4' | 'ipv6' } | null {
  const [rawAddress = '', prefixText, ...rest] = value.trim().split('/');
  // IP เดี่ยวแบบ IPv4-mapped (::ffff:10.0.0.5) เทียบเป็น IPv4 เหมือน IP ของ request
  const address = prefixText === undefined ? normalizeIp(rawAddress) : rawAddress;
  const version = net.isIP(address);
  if (rest.length || !version) return null;

  const maxPrefix = version === 4 ? 32 : 128;
  if (prefixText !== undefined && !/^\d{1,3}$/.test(prefixText)) return null;
  const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
  if (prefix < 1 || prefix > maxPrefix) return null;
  return { address, prefix, family: version === 4 ? 'ipv4' : 'ipv6' };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจว่าเป็น IP เดี่ยวหรือช่วง CIDR ที่ใช้ใน allowedIps ได้
function isIpOrCidr(value: string): boolean {
  return parseIpRange(value) !== null;
}

// Function ตรวจว่า IP อยู่ในรายการ IP/CIDR ที่กำหนด (ค่าในรายการที่รูปแบบผิดถูกข้าม)
function isIpInRanges(ip: string | null | undefined, ranges: string[]): boolean {
  const address = normalizeIp(ip);
  const version = net.isIP(address);
  if (!version) return false;

  const blockList = new net.BlockList();
  ranges.forEach((value) => {
    const range = parseIpRange(value);
    if (range) blockList.addSubnet(range.address, range.prefix, range.family);
  });
  return blockList.check(address, version === 4 ? 'ipv4' : 'ipv6');
}

export { isIpInRanges, isIpOrCidr, normalizeIp };
