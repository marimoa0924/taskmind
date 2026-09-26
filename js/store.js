// 기기 내부 저장(localStorage). 접근이 막힌 환경에서도 앱이 동작하도록 모두 try/catch.
const EXTRAS_KEY = 'taskmind.extras';
const DONE_KEY = 'taskmind.done';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경: 이번 세션에서만 유지 */
  }
}

// ── 추가 일정 ─────────────────────────────
let extras = read(EXTRAS_KEY, []);

export function getExtras() {
  return extras;
}

export function saveExtra(extra) {
  if (extra.id == null) extra = { ...extra, id: Date.now().toString(36) };
  extras = [...extras.filter((x) => x.id !== extra.id), extra];
  write(EXTRAS_KEY, extras);
  return extra;
}

export function deleteExtra(id) {
  extras = extras.filter((x) => x.id !== id);
  write(EXTRAS_KEY, extras);
}

// ── 완료 체크: 오늘 날짜만 저장, 날짜가 바뀌면 초기화 ──
let done = read(DONE_KEY, { date: null, ids: [] });

function ensureDate(today) {
  if (done.date !== today) {
    done = { date: today, ids: [] };
    write(DONE_KEY, done);
  }
}

export function isDone(today, id) {
  ensureDate(today);
  return done.ids.includes(id);
}

export function toggleDone(today, id) {
  ensureDate(today);
  done = {
    date: today,
    ids: done.ids.includes(id) ? done.ids.filter((x) => x !== id) : [...done.ids, id],
  };
  write(DONE_KEY, done);
}

// ── 기본 일정 메모: 블록 id별로 저장, 매주 같은 요일·같은 블록에 반복해서 보인다 ──
const NOTES_KEY = 'taskmind.notes';
let notes = read(NOTES_KEY, {});

export function getNote(id) {
  return notes[id] ?? '';
}

export function setNote(id, text) {
  notes = { ...notes };
  if (text) notes[id] = text;
  else delete notes[id];
  write(NOTES_KEY, notes);
}
