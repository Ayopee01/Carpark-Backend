/* -------------------------------------- Functions -------------------------------------- */

// Class error ที่ส่งกลับ API พร้อม status, error code และ field เสริมใน response
class ApiError extends Error {
  statusCode: number;
  code: string | null;
  details: Record<string, unknown>;

  constructor(statusCode: number, code: string | null, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export { ApiError };
