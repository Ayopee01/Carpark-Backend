// Import Repositories
import * as configRepository from '../repositories/config.repository';

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจสถานะ API
function getHealth(): { status: 'ok'; service: string } {
  return { status: 'ok' as const, service: 'smart-carpark-api' };
}

// Function ตรวจการเชื่อมต่อ database คืน statusCode และ body พร้อมเวลาที่ใช้
async function checkDatabase(): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const startedAt = Date.now();
  try {
    await configRepository.pingDatabase();
  } catch (err) {
    // production ไม่ส่งรายละเอียด error ของ database ออกไป (อาจมี host/user) ให้ดูจาก log แทน
    console.error('Database health check failed:', err);
    const message = process.env.NODE_ENV === 'production' ? 'Database unavailable' : err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: { status: 'error', db: { provider: 'postgresql', enabled: true, message }, durationMs: Date.now() - startedAt },
    };
  }

  return {
    statusCode: 200,
    body: { status: 'ok', db: { provider: 'postgresql', enabled: true }, durationMs: Date.now() - startedAt },
  };
}

export { checkDatabase, getHealth };
