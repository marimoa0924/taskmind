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

export const DAY_END = 24 * 60;

// 고정 블록과 겹칠 때 고를 수 있는 처리 방식
export const RESOLUTIONS = {
  trim: '남는 시간만',
  push: '뒤로 밀기',
  skip: '빼기',
};

/** 추가 일정 전후 이동 시간(분). 이동을 체크하지 않았으면 0. */
export function travelOf(extra) {
  const t = extra.travel;
  if (!t) return { before: 0, after: 0 };
  return { before: Math.max(0, Number(t.before) || 0), after: Math.max(0, Number(t.after) || 0) };
}

/** 이동 시간까지 포함해 추가 일정이 차지하는 구간(분) */
export function spanOf(extra) {
  const { before, after } = travelOf(extra);
  return { s: toMin(extra.start) - before, e: toMin(extra.end) + after };
}

/** 고정 블록이 추가 일정에 얼마나 가려지는지에 따라 기본 처리 방식을 고른다. */
export function defaultResolution(block, extra) {
  const covered = extra.s <= block.s && block.e <= extra.e;
  if (!covered) return 'trim';
  return block.category === 'meal' ? 'skip' : 'push';
}

/**
 * 특정 날짜의 최종 일정을 계산한다.
 *
 * 규칙
 * - 자유시간(free)은 빈 칸: 추가 일정이 겹치면 그만큼 사라진다.
 * - 유동 블록(flexible)과 겹치면, 밀려난 시간을 그날 남은 자유시간으로 옮긴다.
 *   자유시간이 모자라면 남는 만큼은 단축된다.
 * - 고정 블록과 겹치면 추가 일정의 resolve[블록 id]에 따라 처리한다.
 *     trim  겹치지 않는 부분만 남긴다
 *     push  추가 일정이 끝난 직후로 옮긴다. 뒤 일정은 자유시간·유동 블록이 먼저 줄어들며
 *           흡수하고, 모자라면 고정 블록이 줄줄이 밀린다. 24:00을 넘는 부분은 잘린다.
 *     skip  그날은 뺀다
 *   처리 방식이 없으면 conflict로 돌려준다 (저장 불가).
 * - 추가 일정끼리 겹치면 항상 conflict.
 *
 * @returns {{ blocks: object[], conflicts: object[], changes: object[] }}
 *   blocks: { id, s, e, title, category, extra?, moved?, shifted? } 시간순
 *   conflicts: { extra, with, resolvable, covered }
 */
export function buildDay(key, extras) {
  const day = parseDateKey(key).getDay();
  const base = WEEKLY_BLOCKS.filter((b) => b.day === day).map((b) => ({
    id: b.id, s: toMin(b.start), e: toMin(b.end), title: b.title, category: b.category,
  }));
  const todays = extras
    .filter((x) => x.date === key)
    .map((x) => {
      const [s0, e0] = [toMin(x.start), toMin(x.end)];
      const { before, after } = travelOf(x);
      // 이동 시간까지 포함한 구간을 추가 일정이 차지하는 시간으로 본다.
      return { ...x, s0, e0, s: Math.max(0, s0 - before), e: Math.min(DAY_END, e0 + after) };
    })
    .sort((a, b) => a.s - b.s || String(a.id).localeCompare(String(b.id)));

  const conflicts = [];
  todays.forEach((x, i) => {
    for (const b of base) {
      if (kindOf(b.category) === 'fixed' && overlaps(x, b) && !x.resolve?.[b.id]) {
        conflicts.push({ extra: x, with: b, resolvable: true, covered: x.s <= b.s && b.e <= x.e });
      }
    }
    for (const y of todays.slice(i + 1)) {
      if (overlaps(x, y)) conflicts.push({ extra: x, with: y, resolvable: false });
    }
  });

  // 1) 기본 블록에서 추가 일정 구간을 잘라낸다.
  let pieces = base.map((b) => ({ ...b, origin: b.id }));
  const displaced = [];
  const pushes = [];
  for (const x of todays) {
    const next = [];
    for (const p of pieces) {
      if (!overlaps(p, x)) {
        next.push(p);
        continue;
      }
      const kind = kindOf(p.category);
      const how = kind === 'fixed' ? x.resolve?.[p.origin] : 'trim';
      if (!how) {
        next.push(p); // 미해결 충돌: 그대로 둔다
        continue;
      }
      if (how === 'push') {
        pushes.push({ ...p, e: x.e + (p.e - p.s), s: x.e, origS: p.s, shifted: true });
        continue;
      }
      if (how === 'skip') continue;
      const cutS = Math.max(p.s, x.s);
      const cutE = Math.min(p.e, x.e);
      if (p.s < cutS) next.push({ ...p, e: cutS });
      if (cutE < p.e) next.push({ ...p, s: cutE });
      if (kind === 'flexible') displaced.push({ ...p, s: cutS, e: cutE });
    }
    pieces = next;
  }

  // 2) 뒤로 민 블록을 넣고, 뒤 일정을 줄줄이 조정한다.
  const clearOfExtras = (b) => {
    let hit;
    while ((hit = todays.find((x) => overlaps(x, b)))) {
      const len = b.e - b.s;
      b.s = hit.e;
      b.e = hit.e + len;
    }
  };
  // 같은 지점으로 밀리는 블록이 여럿이면 원래 늦은 것부터 넣는다.
  // 먼저 넣은 블록은 다음 블록이 들어올 때 뒤로 밀리므로 원래 순서가 유지된다.
  for (const pushed of pushes.sort((a, b) => a.s - b.s || b.origS - a.origS)) {
    clearOfExtras(pushed);
    let pointer = pushed.e;
    const after = pieces.filter((p) => p.e > pushed.s).sort((a, b) => a.s - b.s);
    for (const p of after) {
      if (p.s >= pointer) break;
      const kind = kindOf(p.category);
      if (kind === 'fixed') {
        const len = p.e - p.s;
        p.s = Math.max(p.s, pointer);
        p.e = p.s + len;
        p.shifted = true;
        clearOfExtras(p);
        pointer = p.e;
      } else {
        if (p.s < pushed.s) {
          pieces.push({ ...p, e: pushed.s }); // 민 블록 앞쪽은 그대로 둔다
          p.s = pushed.s;
        }
        const eaten = Math.min(p.e, pointer) - p.s;
        if (kind === 'flexible') displaced.push({ ...p, e: p.s + eaten });
        p.s += eaten;
      }
    }
    delete pushed.origS;
    pieces.push(pushed);
  }

  // 하루 끝(24:00)을 넘는 부분은 자른다.
  for (const p of pieces) p.e = Math.min(p.e, DAY_END);
  pieces = pieces.filter((p) => p.e > p.s);

  // 3) 밀려난 유동 블록을 남은 자유시간으로 옮긴다: 뒤쪽 가장 가까운 자유시간 우선, 없으면 앞쪽.
  for (const d of displaced.sort((a, b) => a.s - b.s)) {
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
    ...todays.flatMap((x) => {
      const parts = [{ id: `x${x.id}`, s: x.s0, e: x.e0, title: x.title, category: x.category, extra: x }];
      if (x.s < x.s0) {
        parts.push({ id: `x${x.id}-go`, s: x.s, e: x.s0, title: `이동 (${x.title} 가는 길)`, category: 'commute', extra: x, travel: true });
      }
      if (x.e0 < x.e) {
        parts.push({ id: `x${x.id}-back`, s: x.e0, e: x.e, title: `이동 (${x.title} 오는 길)`, category: 'commute', extra: x, travel: true });
      }
      return parts;
    }),
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
      id: b.id,
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
