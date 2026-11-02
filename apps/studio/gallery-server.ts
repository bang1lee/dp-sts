import { createReadStream, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export type GalleryFileType = 'video' | 'audio' | 'image' | 'review';
export interface GalleryFile { path: string; name: string; type: GalleryFileType; size: number; mtime: number; url: string }
export interface GalleryGroup { id: string; title: string; subtitle: string; status: 'in-progress' | 'previous' | 'rejected' | 'technical-pass' | 'unreviewed'; statusLabel: string; mtime: number; poster: string | null; files: GalleryFile[]; reviews: GalleryFile[] }
export interface GalleryManifest { updatedAt: string; truncated: boolean; truncatedRuns: string[]; reviewsTruncated: boolean; groups: GalleryGroup[] }

const project = resolve(import.meta.dirname, '../..');
const extensions: Record<string, { type: GalleryFileType; mime: string }> = {
  '.mp4': { type: 'video', mime: 'video/mp4' }, '.webm': { type: 'video', mime: 'video/webm' },
  '.wav': { type: 'audio', mime: 'audio/wav' }, '.mp3': { type: 'audio', mime: 'audio/mpeg' }, '.flac': { type: 'audio', mime: 'audio/flac' },
  '.png': { type: 'image', mime: 'image/png' }, '.jpg': { type: 'image', mime: 'image/jpeg' }, '.jpeg': { type: 'image', mime: 'image/jpeg' },
  '.md': { type: 'review', mime: 'text/markdown; charset=utf-8' },
};
const skip = /(?:^|[-_])(diagnostic[-_]?input|silent[-_]?input|raw)(?:$|[-_])/i;
const maxFiles = 200000;
const maxFilesPerRun = 20000;
const maxReviews = 5000;
const maxMetadataBytes = 1024 * 1024;
const urlFor = (path: string) => `/artifact-media/${path.split('/').map(encodeURIComponent).join('/')}`;
const isLocal = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');

// Verify every component as well as the resolved path: never traverse a symlink, even one pointing back into the project.
function safeFile(path: string): { absolute: string; size: number; mtime: number } | null {
  const parts = path.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\') || p.includes('\0'))) return null;
  const inRuns = parts[0] === 'runs' && parts.length >= 3 && !parts.some((p) => skip.test(p));
  const inDocs = parts[0] === 'docs' && parts[1] === 'experiments' && parts.length >= 4 && extname(path).toLowerCase() === '.md';
  if (!inRuns && !inDocs) return null;
  const ext = extname(path).toLowerCase();
  if (!extensions[ext] || (ext === '.md' && !inDocs) || (ext !== '.md' && !inRuns)) return null;
  try {
    let current = project;
    for (const part of parts) { current = join(current, part); if (lstatSync(current).isSymbolicLink()) return null; }
    const stat = lstatSync(current);
    const real = realpathSync(current);
    if (!stat.isFile() || stat.size <= 0 || !real.startsWith(project + sep)) return null;
    return { absolute: real, size: stat.size, mtime: stat.mtimeMs };
  } catch { return null; }
}

function fileRecord(path: string): GalleryFile | null {
  const checked = safeFile(path); if (!checked) return null;
  return { path, name: path.split('/').pop()!, type: extensions[extname(path).toLowerCase()].type, size: checked.size, mtime: checked.mtime, url: urlFor(path) };
}

function walk(path: string, out: string[], limit: number, excludeDirectories = new Set<string>()): boolean {
  try {
    let current = project;
    for (const part of path.split('/')) { current = join(current, part); if (lstatSync(current).isSymbolicLink()) return false; }
    // Process non-frame media and nested work directories before bulk frame files.
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => {
      const rank = (name: string) => /^(?:frame[-_]?\d|frames(?:[-_]?\d|$))/i.test(name) ? 1 : 0;
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (entry.isSymbolicLink() || skip.test(entry.name)) continue;
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) { if (!excludeDirectories.has(entry.name) && walk(child, out, limit)) return true; }
      else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        const allowed = path.startsWith('runs/') ? ext !== '.md' && !!extensions[ext] : ext === '.md';
        if (!allowed) continue;
        if (out.length >= limit) return true;
        out.push(child);
      }
    }
  } catch { /* A run may disappear during an active render. */ }
  return false;
}

function metadata(path: string): Record<string, unknown> | null {
  try {
    const parts = path.split('/'); let current = project;
    for (const part of parts) { current = join(current, part); if (lstatSync(current).isSymbolicLink()) return null; }
    const stat = lstatSync(current);
    if (!stat.isFile() || stat.size > maxMetadataBytes || !realpathSync(current).startsWith(project + sep)) return null;
    const data = JSON.parse(readFileSync(current, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}

const titles: Record<string, string> = {
  'dp-sts-gujora-spatial-v01': '구조라 공간 입자', 'dp-sts-gujora-climax-v01': '구조라 · 30초 하이라이트', 'dp-sts-gujora-particles-v01': '구조라 입자 영상',
  'dp-sts-gujora-cover-v01': '구조라 커버', 'dp-sts-gujora-film-v01': '구조라 영상',
  'dp-sts-moonwater-v02': '문워터', 'dp-sts-moonwater-ave-v01': '문워터 · 아베 마리아',
  'dp-sts-bloom-hydra-v01': '블룸 · 하이드라', 'dp-sts-bloom-base-v01': '블룸 · 기본', 'dp-sts-bloom-audio-v01': '블룸 · 오디오',
  'dp-sts-visual-storm-v01': '비주얼 스톰', '01-canopy-melt': '01 캐노피 멜트', '02-coral-vortex': '02 코랄 보텍스',
  '03-glacier-veins': '03 빙하의 결', '04-mycelium-choir': '04 균사체 합창', '05-mineral-memory': '05 광물의 기억',
  '06-neon-abyss': '06 네온 심해', '07-acid-bloom': '07 애시드 블룸',
};
const titleFor = (id: string) => titles[id] || (id.includes('gujora')
  ? `구조라 · ${id.replace(/^dp-sts-gujora-?/, '').replace(/[-_]+/g, ' ')}`
  : id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase()));
function reviewsFor(run: string, docs: GalleryFile[]): GalleryFile[] {
  const family = run.includes('gujora') ? 'gujora-cover' : run.includes('psytrance') ? 'psytrance' : run.includes('yunseul') ? 'yunseul' : /moonwater|visual-storm/.test(run) ? 'moonwater' : '';
  if (!family) return [];
  let terms: RegExp;
  if (family === 'gujora-cover') {
    terms = run.includes('spatial') ? /^spatial-review\.md$/i : run.includes('particles') ? /^(particle|spatial)-review\.md$/i : run.includes('film') ? /^film-review\.md$/i : /^review\.md$/i;
  }
  else if (run.includes('visual-storm')) terms = /visual-storm.*critique|astra-visual-review/i;
  else terms = /review|critique/i;
  return docs.filter((f) => f.path.startsWith(`docs/experiments/${family}/`) && terms.test(f.name));
}
export function hasCompletedRender(name: string, render: Record<string, unknown> | null, hasArtwork: boolean): boolean {
  if (!render || !hasArtwork) return false;
  if (name === 'dp-sts-gujora-spatial-v01' || name === 'dp-sts-gujora-climax-v01') {
    const seconds = name === 'dp-sts-gujora-climax-v01' ? 30 : 464;
    return render.duration === seconds && render.fps === 24 && render.frames === seconds * 24 &&
      Array.isArray(render.errors) && render.errors.length === 0;
  }
  return render.status === 'complete' || render.status === 'completed' ||
    (typeof render.frames === 'number' && render.frames > 0 && typeof render.duration === 'number' && render.duration > 0);
}

function makeGroup(id: string, paths: string[], docs: GalleryFile[]): GalleryGroup {
  const name = id.split('/').pop()!;
  const render = metadata(`runs/${id}/render.json`);
  const found = paths.map(fileRecord).filter((f): f is GalleryFile => f !== null);
  const present = found.some((f) => f.type === 'video' && /^artwork\./i.test(f.name));
  const completeRender = hasCompletedRender(name, render, present);
  // An active MP4 may exist before its index is finalized. The spatial film has
  // an explicit completion record; for other works suppress recently growing
  // artwork files until they have settled or a render record is available.
  const files = found.filter((f) => !(f.type === 'video' && /^artwork\./i.test(f.name) &&
    ((['dp-sts-gujora-spatial-v01', 'dp-sts-gujora-climax-v01'].includes(name) && !completeRender) ||
     (!['dp-sts-gujora-spatial-v01', 'dp-sts-gujora-climax-v01'].includes(name) && !completeRender && Date.now()-f.mtime < 30000))));
  // Artwork and preview files precede frame sequences in the interface.
  files.sort((a, b) => {
    const score = (f: GalleryFile) => /(?:^|\/)artwork\./i.test(f.path) ? 0 : /(?:^|\/)delivery\/poster\./i.test(f.path) ? 1 : /preview/i.test(f.name) ? 2 : /frame[-_]?\d/i.test(f.name) ? 4 : 3;
    return score(a) - score(b) || a.name.localeCompare(b.name);
  });
  const images = files.filter((f) => f.type === 'image');
  const poster = images.find((f) => /(?:^|\/)delivery\/poster\./i.test(f.path)) || images.find((f) => /poster/i.test(f.name)) || images.find((f) => /preview/i.test(f.name)) || images.find((f) => /artwork|cover/i.test(f.name)) || images.find((f) => /frame/i.test(f.name)) || images[0];
  const rejected = /^(dp-sts-gujora-particles-v01|dp-sts-gujora-campfire-v01|dp-sts-gujora-particles-look-v0[12]|dp-sts-gujora-spatial-look-v01)$/.test(name);
  const delivery = metadata(`runs/${id}/delivery/delivery.json`) || metadata(`runs/${id}/delivery.json`);
  const artwork = files.some((f) => f.type === 'video' && /^artwork\./i.test(f.name));
  const verifiedRecord = Boolean(artwork && delivery?.artwork && ['technical_checks_passed', 'passed'].includes(String(delivery?.status)));
  const status: GalleryGroup['status'] = rejected ? 'rejected' : name === 'dp-sts-gujora-climax-v01' && !completeRender ? 'in-progress' : name === 'dp-sts-gujora-spatial-v01' && completeRender ? 'previous' : name === 'dp-sts-gujora-spatial-v01' && !completeRender ? 'in-progress' : verifiedRecord ? 'technical-pass' : 'unreviewed';
  const labels = { rejected: '이전 시안 · 재작업 필요', 'in-progress': '제작 진행 중', previous: '이전 버전 · 무아레 개선 요청', 'technical-pass': '기술 점검 기록 있음', unreviewed: '감상 확인 전' };
  const reviews = reviewsFor(id, docs);
  let directoryMtime = 0;
  try { directoryMtime = lstatSync(join(project, 'runs', id)).mtimeMs; } catch { /* removed */ }
  const statusLabel = name === 'dp-sts-gujora-campfire-v01' ? '이전 시안 · 인물 3명 해석 오류' : name === 'dp-sts-gujora-climax-v01' && completeRender && !verifiedRecord ? '최종 검증 대기' : labels[status];
  return { id, title: titleFor(name), subtitle: id.includes('/') ? titleFor(id.split('/')[0]) : id, status, statusLabel, mtime: Math.max(directoryMtime, ...files.map((f) => f.mtime)), poster: poster?.url || null, files, reviews };
}

export function buildGalleryManifest(limits = { total: maxFiles, perRun: maxFilesPerRun, reviews: maxReviews }): GalleryManifest {
  const paths: string[] = [];
  const truncatedRuns: string[] = [];
  try {
    // Independent run budgets prevent one large frame sequence from hiding later runs.
    const root = join(project, 'runs');
    if (!lstatSync(root).isSymbolicLink()) {
      const runs = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !skip.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name));
      for (const run of runs) {
        // Numbered storm works receive separate budgets so one long frame sequence
        // cannot hide the remaining numbered works in the same run.
        const subworks = run.name === 'dp-sts-visual-storm-v01'
          ? readdirSync(join(root, run.name), { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^\d\d-/.test(entry.name)).map((entry) => entry.name).sort()
          : [];
        const branches = [run.name, ...subworks.map((name) => `${run.name}/${name}`)];
        for (const branch of branches) {
          const runPaths: string[] = [];
          const limit = Math.max(0, Math.min(limits.perRun, limits.total - paths.length));
          if (walk(`runs/${branch}`, runPaths, limit, branch === run.name ? new Set(subworks) : undefined)) truncatedRuns.push(branch);
          paths.push(...runPaths);
        }
      }
    }
  } catch { /* runs may not exist yet */ }
  const docPaths: string[] = [];
  const reviewsTruncated = walk('docs/experiments', docPaths, limits.reviews);
  const docs = docPaths.map(fileRecord).filter((f): f is GalleryFile => f !== null && f.type === 'review');
  const byGroup = new Map<string, string[]>();
  for (const path of paths) {
    const parts = path.split('/');
    const id = parts[1] === 'dp-sts-visual-storm-v01' && /^\d\d-/.test(parts[2] || '') ? `${parts[1]}/${parts[2]}` : parts[1];
    const files = byGroup.get(id) || []; files.push(path); byGroup.set(id, files);
  }
  // The active spatial output directory can be empty while the render is in progress.
  try { if (lstatSync(join(project, 'runs/dp-sts-gujora-spatial-v01')).isDirectory()) byGroup.set('dp-sts-gujora-spatial-v01', byGroup.get('dp-sts-gujora-spatial-v01') || []); } catch { /* absent */ }
  const groups = [...byGroup].map(([id, groupPaths]) => makeGroup(id, groupPaths, docs)).filter((g) => g.files.length || g.status === 'in-progress');
  groups.sort((a, b) => b.mtime - a.mtime || a.id.localeCompare(b.id));
  return { updatedAt: new Date().toISOString(), truncated: truncatedRuns.length > 0 || reviewsTruncated, truncatedRuns, reviewsTruncated, groups };
}

function respondFile(req: IncomingMessage, res: ServerResponse, path: string): void {
  const file = safeFile(path); if (!file) { res.statusCode = 404; res.end(); return; }
  const mime = extensions[extname(path).toLowerCase()].mime;
  res.setHeader('Content-Type', mime); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Accept-Ranges', 'bytes');
  let start = 0, end = file.size - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${file.size}`); res.end(); return; }
    if (!match[1]) { const suffix = Number(match[2]); start = Number.isSafeInteger(suffix) && suffix > 0 ? Math.max(0, file.size - suffix) : file.size; }
    else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${file.size}`); res.end(); return; }
    res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(file.absolute, { start, end });
  stream.on('error', () => res.destroy()); stream.pipe(res);
}

export function artifactGalleryPlugin(): Plugin {
  return { name: 'artifact-gallery', apply: 'serve', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = (req.url || '').split('?')[0];
      if (pathname !== '/api/artifact-gallery' && !pathname.startsWith('/artifact-media/')) { next(); return; }
      if (!isLocal(req)) { res.statusCode = 403; res.end(); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end(); return; }
      if (pathname === '/api/artifact-gallery') {
        const body = JSON.stringify(buildGalleryManifest()); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Length', Buffer.byteLength(body)); res.end(req.method === 'HEAD' ? undefined : body); return;
      }
      try { respondFile(req, res, decodeURIComponent(pathname.slice('/artifact-media/'.length))); } catch { res.statusCode = 400; res.end(); }
    });
  } };
}
