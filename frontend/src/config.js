// Central API base.
//  • Dev: the Vite dev server (5173) and the backend run on different ports, so
//    an absolute URL is required. Set VITE_API_BASE in .env.development.local
//    (defaults to :3001 if unset).
//  • Production build: the backend serves this bundle from the SAME origin, so a
//    relative base ('') is correct — and the public (tunnel) URL needs no rebuild
//    when it changes.
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');
