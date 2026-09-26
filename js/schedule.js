import { CATEGORIES, WEEKLY_BLOCKS } from './data.js';

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function range(s, e) {
  return `${fromMin(s)}–${fromMin(e)}`;
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// 해당 날짜가 속한 주의 월요일
export function weekStart(key) {
  const day = parseDateKey(key).getDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
}

export function kindOf(category) {
  return CATEGORIES[category]?.kind ?? 'fixed';
}

const overlaps = (a, b) => a.s < b.e && b.s < a.e;

/**
 * 특정 날짜의 최종 일정을 계산한다.
 *
 * 규칙
 * - 추가 일정이 고정 블록이나 다른 추가 일정과 겹치면 conflict (저장 불가).
 * - 자유시간(free)은 빈 칸: 추가 일정이 겹치면 그만큼 사라진다.
 * - 유동 블록(flexible)과 겹치면, 밀려난 시간을 그날 남은 자유시간으로 옮긴다.
 *   자유시간이 모자라면 남는 만큼은 단축된다.
 *
 * @returns {{ blocks: object[], conflicts: object[], changes: object[] }}
 *   blocks: { id, s, e, title, category, extra?, moved? } 시간순
 */
export function buildDay(key, extras) {
  const day = parseDateKey(key).getDay();
  const base = WEEKLY_BLOCKS.filter((b) => b.day === day).map((b) => ({
    id: b.id, s: toMin(b.start), e: toMin(b.end), title: b.title, category: b.category,
  }));
  const todays = extras
    .filter((x) => x.date === key)
    .map((x) => ({ ...x, s: toMin(x.start), e: toMin(x.end) }))
    .sort((a, b) => a.s - b.s || String(a.id).localeCompare(String(b.id)));

  const conflicts = [];
  todays.forEach((x, i) => {
    for (const b of base) {
      if (kindOf(b.category) === 'fixed' && overlaps(x, b)) conflicts.push({ extra: x, with: b });
    }
    for (const y of todays.slice(i + 1)) {
      if (overlaps(x, y)) conflicts.push({ extra: x, with: y });
    }
  });

  // 기본 블록에서 추가 일정 구간을 잘라낸다.
  let pieces = base.map((b) => ({ ...b, origin: b.id }));
  const displaced = [];
  for (const x of todays) {
    const next = [];
    for (const p of pieces) {
      if (kindOf(p.category) === 'fixed' || !overlaps(p, x)) {
        next.push(p);
        continue;
      }
      const cutS = Math.max(p.s, x.s);
      const cutE = Math.min(p.e, x.e);
      if (p.s < cutS) next.push({ ...p, e: cutS });
      if (cutE < p.e) next.push({ ...p, s: cutE });
      if (kindOf(p.category) === 'flexible') displaced.push({ ...p, s: cutS, e: cutE });
    }
    pieces = next;
  }

  // 밀려난 유동 블록을 남은 자유시간으로 옮긴다: 뒤쪽 가장 가까운 자유시간 우선, 없으면 앞쪽.
  for (const d of displaced) {
    let need = d.e - d.s;
    while (need > 0) {
      const frees = pieces.filter((p) => p.category === 'free' && p.e > p.s);
      const target =
        frees.filter((f) => f.s >= d.s).sort((a, b) => a.s - b.s)[0] ??
        frees.filter((f) => f.s < d.s).sort((a, b) => b.s - a.s)[0];
      if (!target) break;
      const take = Math.min(need, target.e - target.s);
      pieces.push({ ...d, s: target.s, e: target.s + take, moved: true });
      target.s += take;
      need -= take;
    }
  }
  pieces = pieces.filter((p) => p.e > p.s);

  const changes = describeChanges(base, pieces);

  // id 부여: 원래 블록이 여러 조각으로 나뉘면 접미사를 붙인다.
  const counts = {};
  const blocks = [
    ...pieces
      .sort((a, b) => a.s - b.s)
      .map((p) => {
        const n = (counts[p.origin] = (counts[p.origin] ?? 0) + 1);
        const { origin, ...rest } = p;
        return { ...rest, id: n === 1 ? origin : `${origin}.${n}` };
      }),
    ...todays.map((x) => ({
      id: `x${x.id}`, s: x.s, e: x.e, title: x.title, category: x.category, extra: x,
    })),
  ].sort((a, b) => a.s - b.s || (a.extra ? -1 : 1));

  return { blocks, conflicts, changes };
}

function describeChanges(base, pieces) {
  const changes = [];
  for (const b of base) {
    const mine = pieces.filter((p) => p.origin === b.id).sort((a, c) => a.s - c.s);
    const same = mine.length === 1 && mine[0].s === b.s && mine[0].e === b.e;
    if (same) continue;
    const kept = mine.filter((p) => !p.moved);
    const moved = mine.filter((p) => p.moved);
    const lost = b.e - b.s - mine.reduce((sum, p) => sum + p.e - p.s, 0);
    changes.push({
      title: b.title,
      category: b.category,
      from: range(b.s, b.e),
      kept: kept.map((p) => range(p.s, p.e)),
      moved: moved.map((p) => range(p.s, p.e)),
      lostMinutes: lost,
    });
  }
  return changes;
}

/** 현재 시각(분) 기준 진행 중 / 다음 블록 */
export function locate(blocks, nowMin) {
  const current = blocks.find((b) => b.s <= nowMin && nowMin < b.e) ?? null;
  const next = blocks.find((b) => b.s >= (current ? current.e : nowMin) && b !== current) ?? null;
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  let phase = 'during';
  if (!first || nowMin < first.s) phase = 'before';
  else if (nowMin >= last.e) phase = 'after';
  return { current, next, phase };
}
