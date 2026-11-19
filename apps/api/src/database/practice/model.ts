import type { Identity, Role } from '../../modules/auth/access.js';

export type PracticeGroup = {
  id: string;
  nivel_id: string;
  teacher: Identity;
};

export type PracticeContext = {
  batch: string;
  today: string;
  sessionDates: string[];
  admin: Identity;
  secretary: Identity;
  groups: PracticeGroup[];
  students: { id: string }[];
};

export type PracticeSummary = {
  batch: string;
  created: boolean;
  accounts: { username: string; roles: Role[] }[];
  counts: {
    students: number;
    teachers: number;
    groups: number;
    sessions: number;
    enrollments: number;
    vouchers: number;
    attendance: number;
    grades: number;
    justifications: number;
  };
};
