import { z } from 'zod';

import type { StoredItem } from '@/features/vault/items';

/**
 * Files vault model (child spec 0001-drive-redundancy). The item payload is the file's encrypted
 * metadata; it binds the item to its blob by `blob_id` and the ciphertext hash (AC-7).
 */

export const NAME_MAX = 200;

export const filePayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal('file'),
  name: z.string().trim().min(1).max(NAME_MAX),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
  blob_id: z.string().regex(/^[0-9a-f]{32}$/),
  sha256_ct: z.string().regex(/^[0-9a-f]{64}$/),
  size_ct: z.number().int().positive(),
  chunk_size: z.number().int().positive(),
  total_chunks: z.number().int().positive(),
  added_at: z.string(),
});

export type FilePayload = z.infer<typeof filePayloadSchema>;
export type StoredFile = StoredItem<FilePayload>;
export type BlobState = 'uploading' | 'ok' | 'degraded' | 'missing';

export function parsePayload(raw: unknown): FilePayload | null {
  const r = filePayloadSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** "1.4 MB" style, base 1024, one decimal under 10. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** A name safe to write into the cache: no path separators, no control characters. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (cleaned || 'file').slice(0, 120);
}

export function sortFiles(list: StoredFile[]): StoredFile[] {
  return [...list].sort((a, b) => b.payload.added_at.localeCompare(a.payload.added_at));
}

export function matchesSearch(p: FilePayload, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || p.name.toLowerCase().includes(q);
}

/** Byte ranges of the ciphertext file for Google's resumable upload (multiples of 256 KiB). */
export const UPLOAD_CHUNK = 1024 * 1024;

export function uploadRanges(
  total: number,
  from = 0,
  chunk = UPLOAD_CHUNK,
): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let start = from; start < total; start += chunk)
    out.push({ start, end: Math.min(total, start + chunk) - 1 });
  return out;
}

/** Parses Google's `Range: bytes=0-1048575` answer to a status query; -1 when nothing arrived. */
export function lastByteFromRange(header: string | null): number {
  const m = /bytes=0-(\d+)/.exec(header ?? '');
  return m ? Number(m[1]) : -1;
}

/** What the file sheet can draw itself; anything else opens in another app on the phone. */
export type PreviewKind = 'image' | 'text' | 'other';

/** Images Android and iOS both decode without help (no HEIC: older Androids cannot). */
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
/** Larger files are not decrypted just to look at; they open on request. */
export const IMAGE_PREVIEW_MAX = 25 * 1024 * 1024;
export const TEXT_PREVIEW_MAX = 256 * 1024;

export function previewKind(p: Pick<FilePayload, 'mime' | 'size'>): PreviewKind {
  const mime = p.mime.toLowerCase();
  if (IMAGE_MIMES.includes(mime) && p.size <= IMAGE_PREVIEW_MAX) return 'image';
  const text = mime.startsWith('text/') || mime === 'application/json';
  if (text && p.size <= TEXT_PREVIEW_MAX) return 'text';
  return 'other';
}

const MIME_NAMES: Record<string, string> = {
  'application/pdf': 'PDF document',
  'application/json': 'JSON text',
  'application/zip': 'ZIP archive',
  'application/msword': 'Word document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'application/vnd.ms-excel': 'Excel sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel sheet',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain': 'Text',
  'text/csv': 'CSV sheet',
};

/** "PNG image", "PDF document": the type as a person says it. */
export function typeLabel(mime: string): string {
  const m = mime.toLowerCase();
  const known = MIME_NAMES[m];
  if (known) return known;
  const [group, sub = ''] = m.split('/');
  if (sub === 'octet-stream') return 'File';
  const short = sub.replace(/^x-/, '').split(/[.+;-]/)[0]?.toUpperCase() ?? '';
  if (group === 'image') return `${short} image`.trim();
  if (group === 'video') return `${short} video`.trim();
  if (group === 'audio') return `${short} audio`.trim();
  return short ? `${short} file` : 'File';
}
