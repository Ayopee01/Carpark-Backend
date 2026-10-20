// Import Types
import type { EdcVerificationInput, EdcVerificationResult, EdcVerifier } from '../../types/shared/payment.type';

/* -------------------------------------- Config -------------------------------------- */

// Config ตัวตรวจผลอนุมัติบัตรกับ host ของ EDC/acquirer แยกตาม provider ของเครื่อง EDC (ค่า provider ตัวพิมพ์เล็ก)
// ตอนนี้ยังไม่มีเครื่องและ API ของผู้ให้บริการ จึงยังว่าง เพิ่มผู้ให้บริการใหม่ได้ที่นี่โดยไม่ต้องแก้ flow การจ่ายเงิน
// ตัวตรวจคืน verified เมื่อพบรายการ, rejected เมื่อ host ตอบว่าไม่มีรายการนี้ หรือ unverified เมื่อถาม host ไม่ได้
const EDC_VERIFIERS: Record<string, EdcVerifier> = {};

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ approval code ของการรับบัตรจากอุปกรณ์กับผู้ให้บริการ EDC ก่อนบันทึก (ไม่มีตัวตรวจของ provider นี้ = unverified)
async function verifyEdcApproval(input: EdcVerificationInput): Promise<EdcVerificationResult> {
  const verifier = input.provider ? EDC_VERIFIERS[input.provider.trim().toLowerCase()] : undefined;
  if (!verifier) return { status: 'unverified' };
  return verifier(input);
}

export { verifyEdcApproval };
