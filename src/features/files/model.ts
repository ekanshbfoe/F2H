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

/** How the file sheet shows a file; `other` (Word, Excel, ZIP) opens in another app. */
export type PreviewKind = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'other';

/** Types each kind covers, by MIME type and, for a picker that only said "a file", by extension. */
const KINDS: { kind: Exclude<PreviewKind, 'other'>; mimes: RegExp; ext: RegExp; max: number }[] = [
  {
    // what Android and iOS both decode without help (no HEIC: older Androids cannot)
    kind: 'image',
    mimes: /^image\/(jpeg|png|webp|gif|bmp)$/,
    ext: /\.(jpe?g|png|webp|gif|bmp)$/,
    max: 25 * 1024 * 1024,
  },
  {
    kind: 'text',
    mimes: /^(text\/.+|application\/json)$/,
    ext: /\.(txt|md|csv|json|log)$/,
    max: 256 * 1024,
  },
  // the reader holds the whole PDF in memory while drawing it: kept small for a 1 GB phone
  { kind: 'pdf', mimes: /^application\/pdf$/, ext: /\.pdf$/, max: 8 * 1024 * 1024 },
  {
    kind: 'video',
    mimes: /^video\/(mp4|3gpp|webm|quicktime|x-matroska)$/,
    ext: /\.(mp4|3gp|webm|mov|mkv)$/,
    max: 500 * 1024 * 1024,
  },
  {
    kind: 'audio',
    mimes: /^audio\/(mpeg|mp4|x-m4a|aac|ogg|wav|x-wav|flac|amr|3gpp|opus)$/,
    ext: /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|amr)$/,
    max: 200 * 1024 * 1024,
  },
];

/**
 * Above this a file waits for a tap before it is downloaded and decrypted: the sheet opens at
 * once, and an old phone only does the slow work when asked.
 */
export const AUTO_OPEN_MAX = 8 * 1024 * 1024;

export function previewKind(
  p: Pick<FilePayload, 'mime' | 'size'> & { name?: string },
): PreviewKind {
  const mime = p.mime.toLowerCase();
  const name = (p.name ?? '').toLowerCase();
  const generic = mime === '' || mime === 'application/octet-stream';
  const match = KINDS.find((k) => k.mimes.test(mime) || (generic && k.ext.test(name)));
  return match && p.size <= match.max ? match.kind : 'other';
}

/** The MIME type to hand a viewer: the stored one, or one guessed from the name. */
export function viewerMime(p: Pick<FilePayload, 'mime' | 'name'>): string {
  const mime = p.mime.toLowerCase();
  if (mime && mime !== 'application/octet-stream') return p.mime;
  const ext = /\.([a-z0-9]+)$/.exec(p.name.toLowerCase())?.[1] ?? '';
  return EXT_MIMES[ext] ?? p.mime;
}

const EXT_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  apk: 'application/vnd.android.package-archive',
};

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
  const short = (sub.replace(/^x-/, '').split(/[.+;-]/)[0] ?? '').toUpperCase();
  if (group === 'image') return `${short} image`.trim();
  if (group === 'video') return `${short} video`.trim();
  if (group === 'audio') return `${short} audio`.trim();
  return short ? `${short} file` : 'File';
}
