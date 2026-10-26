// Import Library
import fs from 'fs';
import path from 'path';

/* -------------------------------------- Config -------------------------------------- */

// Config path เก็บไฟล์ upload คือ ./uploads (ใน Docker คือ /app/uploads ที่ mount จาก UPLOADS_HOST_PATH บน host)
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/* -------------------------------------- Functions -------------------------------------- */

// Function ลบไฟล์ที่อยู่ใน uploads จาก URL /uploads/... (ใช้ basename กัน path traversal จากค่า config)
function deleteUploadedFile(fileUrl: string | null | undefined): void {
  if (!fileUrl || !String(fileUrl).startsWith('/uploads/')) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(fileUrl));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export { UPLOAD_DIR, deleteUploadedFile };
