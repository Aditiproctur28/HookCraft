// Central API base. Override per-environment with VITE_API_BASE (Phase 9 deploy).
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
