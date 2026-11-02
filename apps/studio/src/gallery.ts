import './gallery.css';

type Kind = 'video' | 'audio' | 'image' | 'review';
interface MediaFile { path: string; name: string; type: Kind; size: number; mtime: number; url: string }
interface MediaGroup { id: string; title: string; subtitle: string; status: string; statusLabel: string; mtime: number; poster: string | null; files: MediaFile[]; reviews: MediaFile[] }
interface Manifest { updatedAt: string; groups: MediaGroup[]; truncated?: boolean }

const $ = <T extends HTMLElement>(selector: string): T => {
  const item = document.querySelector<T>(selector);
  if (!item) throw new Error(`Missing element: ${selector}`);
  return item;
};
const gallery = $<HTMLDivElement>('#gallery');
const notice = $<HTMLDivElement>('#notice');
const search = $<HTMLInputElement>('#search');
const dialog = $<HTMLDialogElement>('#detail');
const player = $<HTMLDivElement>('#player');
const filesBox = $<HTMLDivElement>('#files');
const more = $<HTMLButtonElement>('#more');
const moreFiles = $<HTMLButtonElement>('#more-files');
let groups: MediaGroup[] = [];
let filter = 'all';
let shown = 24;
let selectedGroup: MediaGroup | null = null;
let selectedFile: MediaFile | null = null;
let fileLimit = 12;
let lastFocused: HTMLElement | null = null;
let requestNumber = 0;
let scanTruncated = false;

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function safeUrl(url: string | null): string {
  return url?.startsWith('/artifact-media/') ? url : '';
}
function types(group: MediaGroup): string {
  const kinds = new Set(group.files.map((file) => file.type));
  return [kinds.has('video') && '영상', kinds.has('audio') && '음원', kinds.has('image') && '이미지', group.reviews.length > 0 && '검수 기록'].filter(Boolean).join('  ·  ') || '작업 준비 중';
}
function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function matches(group: MediaGroup): boolean {
  const wanted = search.value.trim().toLocaleLowerCase();
  const containsType = filter === 'all' || (filter === 'review' ? group.reviews.length > 0 : group.files.some((file) => file.type === filter));
  if (!containsType) return false;
  if (!wanted) return true;
  const family = group.id.toLocaleLowerCase().includes('gujora') ? ['구조라', '윤돌섬'] : [];
  return [group.id, group.title, group.subtitle, ...family, ...group.files.map((file) => file.name), ...group.reviews.map((file) => file.name)].some((value) => value.toLocaleLowerCase().includes(wanted));
}
function renderGallery(): void {
  const matched = groups.filter(matches);
  const totalFiles = groups.reduce((count, group) => count + group.files.length, 0);
  $('#count').textContent = `${groups.length.toLocaleString('ko-KR')}개 작업 · ${totalFiles.toLocaleString('ko-KR')}개 파일`;
  const visible = matched.slice(0, shown);
  gallery.innerHTML = visible.map((group) => {
    const poster = safeUrl(group.poster);
    const visual = poster ? `<img src="${escape(poster)}" alt="" loading="lazy" decoding="async">` : `<span class="image-fallback">${escape(types(group))}</span>`;
    return `<button class="card" type="button" data-group="${escape(group.id)}" aria-label="${escape(group.title)} 열기"><div class="card-image">${visual}</div><div class="card-top"><h3>${escape(group.title)}</h3><span class="card-badge ${escape(group.status)}">${escape(group.statusLabel)}</span></div><p>${escape(types(group))}</p><p>${escape(group.subtitle)}</p></button>`;
  }).join('');
  notice.textContent = matched.length ? (scanTruncated ? '파일이 많아 일부 작업이 목록에서 빠졌습니다.' : '') : (groups.length ? '일치하는 작품이 없습니다. 다른 검색어나 유형을 선택해 보세요.' : '아직 표시할 작업이 없습니다.');
  more.hidden = matched.length <= shown;
  more.textContent = `더 보기 (${Math.min(shown, matched.length)} / ${matched.length})`;
}

async function refresh(): Promise<void> {
  try {
    const response = await fetch('/api/artifact-gallery', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json() as Manifest;
    if (!Array.isArray(manifest.groups)) throw new Error('Invalid gallery data');
    groups = manifest.groups;
    scanTruncated = Boolean(manifest.truncated);
    const latest = Math.max(0, ...groups.map((group) => group.mtime || 0));
    const changed = new Date(latest);
    $('#freshness').textContent = latest && !Number.isNaN(changed.getTime()) ? `최근 변경 ${changed.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 자동 새로고침` : '자동 새로고침';
    renderGallery();
  } catch {
    $('#freshness').textContent = '목록 연결을 확인해 주세요';
    notice.textContent = '작품 목록을 불러오지 못했습니다. 새로고침해 주세요.';
  }
}
function renderFiles(): void {
  if (!selectedGroup) return;
  const list = selectedGroup.files.slice(0, fileLimit);
  filesBox.innerHTML = list.map((file) => `<button class="file${selectedFile?.path === file.path ? ' selected' : ''}" data-path="${escape(file.path)}" type="button"><span>${escape(file.name)}</span><span>${bytes(file.size)}</span></button>`).join('');
  $('#file-count').textContent = `${selectedGroup.files.length}개`;
  moreFiles.hidden = selectedGroup.files.length <= fileLimit;
  moreFiles.textContent = `파일 더 보기 (${Math.min(fileLimit, selectedGroup.files.length)} / ${selectedGroup.files.length})`;
  const reviewSection = $('#review-section');
  reviewSection.hidden = selectedGroup.reviews.length === 0;
  $('#reviews').innerHTML = selectedGroup.reviews.map((file) => `<button class="review-link" data-review="${escape(file.path)}" type="button">${escape(file.name)}</button>`).join('');
}
async function openFile(file: MediaFile): Promise<void> {
  const url = safeUrl(file.url);
  if (!url) return;
  selectedFile = file;
  const current = ++requestNumber;
  player.replaceChildren();
  $('#player-caption').textContent = `${file.name}  ·  ${bytes(file.size)}`;
  if (file.type === 'video') {
    const video = document.createElement('video'); video.controls = true; video.preload = 'none'; video.playsInline = true; video.src = url; player.append(video);
  } else if (file.type === 'audio') {
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = url; player.append(audio);
  } else if (file.type === 'image') {
    const image = document.createElement('img'); image.alt = file.name; image.src = url; player.append(image);
  } else {
    const pre = document.createElement('pre'); pre.textContent = '검수 기록을 불러오는 중입니다.'; player.append(pre);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Could not load review');
      const body = await response.text();
      if (current === requestNumber) pre.textContent = body;
    } catch { if (current === requestNumber) pre.textContent = '검수 기록을 불러오지 못했습니다.'; }
  }
  renderFiles();
}
function openGroup(group: MediaGroup): void {
  selectedGroup = group; selectedFile = null; fileLimit = 12; lastFocused = document.activeElement as HTMLElement;
  $('#detail-title').textContent = group.title;
  $('#detail-subtitle').textContent = `${group.subtitle}  ·  ${group.statusLabel}`;
  player.replaceChildren(); $('#player-caption').textContent = '';
  const first = group.files.find((file) => file.type === 'video' && /^artwork\./i.test(file.name)) || group.files.find((file) => file.type === 'video') || group.files.find((file) => file.type === 'audio') || group.files.find((file) => file.type === 'image') || (group.id === 'dp-sts-gujora-spatial-v01' ? undefined : group.reviews[0]);
  if (first) void openFile(first);
  else if (group.id === 'dp-sts-gujora-spatial-v01') {
    const image = document.createElement('img');
    image.src = '/artifact-media/runs/dp-sts-gujora-film-v01/cover.png';
    image.alt = '구조라 원본 커버';
    player.append(image);
    $('#player-caption').textContent = '원본 커버 · 작업이 완성되면 결과물이 여기에 나타납니다.';
  } else player.innerHTML = '<p class="player-message">아직 볼 수 있는 파일이 없습니다. 작업이 완성되면 여기에 나타납니다.</p>';
  renderFiles();
  if (!dialog.open) dialog.showModal();
  $('#close').focus();
}

gallery.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-group]');
  const group = groups.find((item) => item.id === button?.dataset.group);
  if (group) openGroup(group);
});
$('#feature').addEventListener('click', () => {
  const group = groups.find((item) => item.id === 'dp-sts-gujora-climax-v01') || groups.find((item) => item.id === 'dp-sts-gujora-spatial-v01') || groups.find((item) => item.id === 'dp-sts-gujora-film-v01');
  if (group) openGroup(group);
});
$('.filters').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter || 'all'; shown = 24;
  document.querySelectorAll<HTMLButtonElement>('.filter').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  renderGallery();
});
search.addEventListener('input', () => { shown = 24; renderGallery(); });
more.addEventListener('click', () => { shown += 24; renderGallery(); });
moreFiles.addEventListener('click', () => { fileLimit += 24; renderFiles(); });
filesBox.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-path]');
  const file = selectedGroup?.files.find((item) => item.path === button?.dataset.path);
  if (file) void openFile(file);
});
$('#reviews').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-review]');
  const file = selectedGroup?.reviews.find((item) => item.path === button?.dataset.review);
  if (file) void openFile(file);
});
$('#refresh').addEventListener('click', () => void refresh());
$('#close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { requestNumber++; player.replaceChildren(); selectedGroup = null; selectedFile = null; (lastFocused?.isConnected ? lastFocused : search).focus(); });
void refresh();
window.setInterval(() => void refresh(), 20_000);
