/* -------------------------------------- Members Types -------------------------------------- */

// Type member ในรูปแบบ API
export interface MemberApi {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  role: string;
  status: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Type meta ของรายการ member
export interface MemberListMeta {
  total: number;
  totalMembers: number;
  activeMembers: number;
  totalAdmins: number;
}

// Type ข้อมูล member ที่ผ่าน validate แล้ว
export interface MemberInput {
  username?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  status?: string;
  permissions?: string[];
  password?: string;
}
