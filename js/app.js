import { CATEGORIES, EXTRA_CATEGORY_KEYS } from './data.js';
import {
  DAY_LABELS, RESOLUTIONS, addDays, buildDay, dateKey, defaultResolution, fromMin, spanOf, travelOf, kindOf, locate, parseDateKey, range,
  toMin, weekStart,
} from './schedule.js';
import { extrasICS, upcomingExtras } from './ics.js';
import {
  deleteExtra, getExtras, getNote, getSettings, isDone, saveExtra, setNote, setSettings, toggleDone,
} from './store.js';

const PX_PER_MIN = 1.3; // 주간 뷰 세로 배율
const REFRESH_MS = 30_000;
const ALARM_CHECK_MS = 10_000;
const APP_VERSION = '2026.09.27-1'; // 배포할 때 sw.js의 CACHE와 함께 올린다

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');

const todayKey = () => dateKey(new Date());

const state = {
  view: 'today',
  date: todayKey(), // 오늘 상세 뷰가 보여줄 날짜
  week: weekStart(todayKey()), // 주간 뷰의 월요일
  month: todayKey().slice(0, 7), // 월별 뷰 "YYYY-MM"
};

// ── 유틸 ─────────────────────────────────
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const color = (category) => CATEGORIES[category]?.color ?? CATEGORIES.extra.color;
const label = (category) => CATEGORIES[category]?.label ?? category;

function catChip(category) {
  const cls = kindOf(category) === 'free' ? 'cat free' : 'cat';
  return `<span class="${cls}" style="--c:${color(category)}">${esc(label(category))}</span>`;
}

function dateLabel(key) {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
}

function duration(min) {
  const m = Math.max(0, Math.ceil(min));
  const h = Math.floor(m / 60);
  if (h && m % 60) return `${h}시간 ${m % 60}분`;
  return h ? `${h}시간` : `${m}분`;
}

// 블록에 달린 메모: 추가 일정(이동 포함)은 그 일정의 메모, 기본 일정은 매주 반복되는 블록 메모
const baseId = (block) => block.id.split('.')[0];
const rawExtra = (block) => getExtras().find((x) => x.id === block.extra.id);

function memoOf(block) {
  if (block.extra) return rawExtra(block)?.memo ?? '';
  return getNote(baseId(block));
}

function saveMemo(block, text) {
  if (block.extra) {
    const x = rawExtra(block);
    if (x) saveExtra({ ...x, memo: text || undefined });
  } else {
    setNote(baseId(block), text);
  }
}

// ── 화면 2: 오늘 상세 뷰 ─────────────────────
function renderToday() {
  const today = todayKey();
  const isToday = state.date === today;
  const { blocks } = buildDay(state.date, getExtras());
  const now = nowMinutes();

  let card;
  if (isToday) {
    const { current, next, phase } = locate(blocks, now);
    const nextLine = next
      ? `<div class="next">다음 · ${fromMin(next.s)} ${esc(next.title)} ${catChip(next.category)}</div>`
      : '';
    if (current) {
      const free = kindOf(current.category) === 'free';
      const pct = ((now - current.s) / (current.e - current.s)) * 100;
      card = `
        <section class="now-card ${free ? 'free' : ''}" style="--c:${color(current.category)}">
          <div class="eyebrow">지금 할 일 · ${range(current.s, current.e)}</div>
          <div class="title">${esc(current.title)}</div>
          <div class="meta">${esc(label(current.category))} · ${duration(current.e - now)} 남음</div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span style="width:${pct}%"></span></div>
          ${nextLine}
        </section>`;
    } else {
      const title = { before: '오늘 하루 준비 중', after: '오늘 일정 종료', during: '빈 시간' }[phase];
      const sub = phase === 'after' ? '수고했어요. 푹 쉬어요.' : next ? `${duration(next.s - now)} 뒤 시작` : '';
      card = `
        <section class="now-card idle">
          <div class="eyebrow">${fromMin(Math.floor(now))}</div>
          <div class="title">${title}</div>
          <div class="meta">${sub}</div>
          ${nextLine}
        </section>`;
    }
  } else {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    card = `
      <section class="now-card idle">
        <div class="eyebrow">${state.date < today ? '지난 날' : '미리 보기'}</div>
        <div class="title">${DAY_LABELS[parseDateKey(state.date).getDay()]}요일 일정</div>
        <div class="meta">${first ? `${fromMin(first.s)} 시작 · ${fromMin(last.e)} 마무리 · ${blocks.length}개` : ''}</div>
      </section>`;
  }

  const items = blocks.map((b) => {
    const free = kindOf(b.category) === 'free';
    const done = isToday && !free && isDone(today, b.id);
    const cls = ['item'];
    if (free) cls.push('free');
    if (isToday && b.s <= now && now < b.e) cls.push('current');
    if (isToday && b.e <= now) cls.push('past');
    if (done) cls.push('done');
    cls.push('tappable');
    const sub = [b.travel ? '이동 시간' : b.extra ? '추가 일정' : '', b.moved ? '자유시간으로 이동됨' : '', b.shifted ? '추가 일정 때문에 밀림' : ''].filter(Boolean).join(' · ');
    const memo = memoOf(b);
    return `
      <li class="${cls.join(' ')}" style="--c:${color(b.category)}" data-id="${esc(b.id)}">
        <span class="time">${range(b.s, b.e)}</span>
        <span class="body">
          ${catChip(b.category)}
          <span class="t">${esc(b.title)}</span>
          ${sub ? `<span class="sub">${sub}</span>` : ''}
          ${memo ? `<span class="memo-line">📝 ${esc(memo.split('\n')[0])}</span>` : ''}
        </span>
        <button type="button" class="check" aria-label="완료 표시" aria-pressed="${done}" ${isToday && !free ? '' : 'disabled'}>${done ? '✓' : ''}</button>
      </li>`;
  });

  $view.innerHTML = `
    <header class="head">
      <button type="button" class="icon-btn" data-nav="-1" aria-label="이전 날">◀</button>
      <h1>${dateLabel(state.date)}</h1>
      ${isToday ? '' : '<button type="button" class="chip-btn" data-nav="today">오늘</button>'}
      <button type="button" class="icon-btn" data-nav="1" aria-label="다음 날">▶</button>
      <button type="button" class="icon-btn" data-act="alarm" aria-label="알림 설정">${getSettings().notify ? '🔔' : '🔕'}</button>
    </header>
    ${card}
    <ol class="timeline">${items.join('') || '<li class="empty">일정이 없어요</li>'}</ol>`;

  $view.querySelectorAll('[data-nav]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const n = btn.dataset.nav;
      state.date = n === 'today' ? todayKey() : addDays(state.date, Number(n));
      render();
    }),
  );

  $view.querySelector('[data-act="alarm"]').addEventListener('click', openAlarmSettings);

  $view.querySelectorAll('.item').forEach((li) => {
    const block = blocks.find((b) => b.id === li.dataset.id);
    li.querySelector('.check').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDone(today, block.id);
      render();
    });
    li.addEventListener('click', () => openDetail(state.date, block));
  });
}

// ── 화면 1: 주간 블록 뷰 ─────────────────────
function renderWeek() {
  const today = todayKey();
  const extras = getExtras();
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
  const built = days.map((key) => buildDay(key, extras).blocks.filter((b) => kindOf(b.category) !== 'free'));

  const all = built.flat();
  const startMin = Math.floor(Math.min(...all.map((b) => b.s), 6.5 * 60) / 60) * 60;
  const endMin = Math.ceil(Math.max(...all.map((b) => b.e), 22 * 60) / 60) * 60;
  const height = (endMin - startMin) * PX_PER_MIN;
  const y = (min) => (min - startMin) * PX_PER_MIN;

  const hourLabels = [];
  for (let m = startMin; m <= endMin; m += 60) {
    if (m > startMin) hourLabels.push(`<span style="top:${y(m)}px">${m / 60}</span>`);
  }

  const heads = days.map((key) => {
    const d = parseDateKey(key);
    return `<button type="button" class="dh ${key === today ? 'today' : ''}" data-date="${key}">
      ${DAY_LABELS[d.getDay()]}<small>${d.getMonth() + 1}/${d.getDate()}</small></button>`;
  });

  const now = nowMinutes();
  const cols = days.map((key, i) => {
    const blocks = built[i].map((b) => {
      const h = (b.e - b.s) * PX_PER_MIN - 1;
      const showTime = h >= 44;
      return `<button type="button" class="blk ${b.extra ? 'extra' : ''}" data-date="${key}" data-id="${esc(b.id)}"
        style="top:${y(b.s)}px;height:${h}px;--c:${color(b.category)}"
        aria-label="${esc(`${b.title} ${range(b.s, b.e)} ${label(b.category)}`)}">
        <b>${esc(b.title)}</b>${showTime ? `<span>${range(b.s, b.e)}</span>` : ''}</button>`;
    });
    const line = key === today && now >= startMin && now <= endMin ? `<div class="nowline" style="top:${y(now)}px"></div>` : '';
    return `<div class="col ${key === today ? 'today' : ''}" style="height:${height}px">${blocks.join('')}${line}</div>`;
  });

  const first = parseDateKey(days[0]);
  const last = parseDateKey(days[6]);
  const isThisWeek = state.week === weekStart(today);

  $view.innerHTML = `
    <header class="head">
      <button type="button" class="icon-btn" data-nav="-7" aria-label="이전 주">◀</button>
      <h1>${first.getMonth() + 1}/${first.getDate()} – ${last.getMonth() + 1}/${last.getDate()}</h1>
      ${isThisWeek ? '' : '<button type="button" class="chip-btn" data-nav="today">이번 주</button>'}
      <button type="button" class="icon-btn" data-nav="7" aria-label="다음 주">▶</button>
    </header>
    <div class="week" style="--hour:${60 * PX_PER_MIN}px;--offset:0px">
      <div class="corner"></div>${heads.join('')}
      <div class="hours" style="height:${height}px">${hourLabels.join('')}</div>${cols.join('')}
    </div>
    <div class="legend">${Object.keys(CATEGORIES).filter((k) => k !== 'free').map(catChip).join('')}</div>`;

  $view.querySelectorAll('[data-nav]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const n = btn.dataset.nav;
      state.week = n === 'today' ? weekStart(todayKey()) : addDays(state.week, Number(n));
      render();
    }),
  );
  $view.querySelectorAll('.dh').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.date = btn.dataset.date;
      setView('today');
    }),
  );
  $view.querySelectorAll('.blk').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = days.indexOf(btn.dataset.date);
      openDetail(btn.dataset.date, built[i].find((b) => b.id === btn.dataset.id));
    }),
  );
}

// ── 화면 3: 월별 일정 뷰 ─────────────────────
function renderMonth() {
  const today = todayKey();
  const [y, m] = state.month.split('-').map(Number);
  const firstKey = `${state.month}-01`;
  const gridStart = weekStart(firstKey);
  const lastDay = new Date(y, m, 0).getDate();
  const weeks = Math.ceil((((parseDateKey(firstKey).getDay() + 6) % 7) + lastDay) / 7);

  const counts = {};
  for (const x of getExtras()) counts[x.date] = (counts[x.date] ?? 0) + 1;

  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = addDays(gridStart, i);
    const d = parseDateKey(key);
    const n = counts[key] ?? 0;
    const cls = ['cell'];
    if (key.slice(0, 7) !== state.month) cls.push('out');
    if (key === today) cls.push('today');
    const dots = n ? `<span class="dots">${'<i class="dot"></i>'.repeat(Math.min(n, 3))}${n > 3 ? `+${n - 3}` : ''}</span>` : '';
    cells.push(`<button type="button" class="${cls.join(' ')}" data-date="${key}"
      aria-label="${dateLabel(key)}${n ? `, 추가 일정 ${n}개` : ''}">${d.getDate()}${dots}</button>`);
  }

  const isThisMonth = state.month === today.slice(0, 7);
  $view.innerHTML = `
    <header class="head">
      <button type="button" class="icon-btn" data-nav="-1" aria-label="이전 달">◀</button>
      <h1>${y}년 ${m}월</h1>
      ${isThisMonth ? '' : '<button type="button" class="chip-btn" data-nav="today">이번 달</button>'}
      <button type="button" class="icon-btn" data-nav="1" aria-label="다음 달">▶</button>
    </header>
    <div class="month" style="--extra:${CATEGORIES.extra.color}">
      ${['월', '화', '수', '목', '금', '토', '일'].map((w) => `<div class="wd">${w}</div>`).join('')}
      ${cells.join('')}
    </div>
    <p class="empty">점은 그날의 추가 일정이에요. 날짜를 누르면 그날 추가된 일정을 보여줘요.</p>
    <p class="version">버전 ${APP_VERSION}</p>`;

  const move = (n) => {
    if (n === 'today') state.month = todayKey().slice(0, 7);
    else state.month = dateKey(new Date(y, m - 1 + n, 1)).slice(0, 7);
    render();
  };
  $view.querySelectorAll('[data-nav]').forEach((btn) =>
    btn.addEventListener('click', () => move(btn.dataset.nav === 'today' ? 'today' : Number(btn.dataset.nav))),
  );
  $view.querySelectorAll('.cell').forEach((btn) =>
    btn.addEventListener('click', () => openDayExtras(btn.dataset.date)),
  );

  const grid = $view.querySelector('.month');
  let startX = null;
  grid.addEventListener('touchstart', (e) => (startX = e.touches[0].clientX), { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
  });
}

// ── 시트: 블록 상세 ─────────────────────────
function openDetail(key, block) {
  const today = todayKey();
  const free = kindOf(block.category) === 'free';
  const canCheck = key === today && !free;
  const done = canCheck && isDone(today, block.id);
  const notes = [
    block.travel && '추가 일정의 이동 시간',
    block.moved && '추가 일정 때문에 자유시간으로 이동됨',
    block.shifted && '추가 일정 때문에 밀림',
  ].filter(Boolean);
  const memoHint = block.extra ? '이 일정에만 저장돼요' : `매주 ${DAY_LABELS[parseDateKey(key).getDay()]}요일 이 일정에 똑같이 보여요`;

  $sheet.innerHTML = `
    <div class="detail">
      <h2>${esc(block.title)}</h2>
      <dl>
        <dt>날짜</dt><dd>${dateLabel(key)}</dd>
        <dt>시간</dt><dd>${range(block.s, block.e)} (${duration(block.e - block.s)})</dd>
        <dt>카테고리</dt><dd>${catChip(block.category)}</dd>
        ${notes.length ? `<dt>상태</dt><dd>${notes.join(' · ')}</dd>` : ''}
      </dl>
      <label class="memo">메모 · 설명
        <textarea name="memo" rows="4" maxlength="1000" placeholder="준비물, 장소, 할 일 등을 적어 두세요">${esc(memoOf(block))}</textarea>
        <small>${memoHint} · 입력하면 자동 저장</small>
      </label>
      <div class="actions">
        ${canCheck ? `<button type="button" class="btn" data-act="done">${done ? '완료 취소' : '완료로 표시'}</button>` : ''}
        ${block.extra ? '<button type="button" class="btn" data-act="edit">일정 편집</button>' : ''}
        ${block.extra ? '<button type="button" class="btn" data-act="ics">캘린더에 추가</button>' : ''}
        ${state.view !== 'today' ? '<button type="button" class="btn" data-act="day">그날 보기</button>' : ''}
        <button type="button" class="btn primary" data-act="close">닫기</button>
      </div>
    </div>`;

  const memo = $sheet.querySelector('[name="memo"]');
  let timer;
  const flush = () => {
    clearTimeout(timer);
    saveMemo(block, memo.value.trim());
  };
  memo.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  });
  // 닫힐 때(닫기 버튼·바깥 탭 모두) 메모를 저장하고 목록의 메모 미리보기를 갱신한다.
  const onClose = () => {
    flush();
    render();
  };
  $sheet.addEventListener('close', onClose, { once: true });
  const close = () => $sheet.close();
  $sheet.querySelector('[data-act="close"]').onclick = close;
  const act = (name, fn) => {
    const btn = $sheet.querySelector(`[data-act="${name}"]`);
    if (btn) btn.onclick = fn;
  };
  act('done', () => {
    toggleDone(today, block.id);
    close();
  });
  act('edit', () => {
    flush();
    $sheet.removeEventListener('close', onClose); // 같은 시트에서 편집 화면으로 바뀌므로 이전 메모 저장을 떼어 낸다
    openForm(rawExtra(block) ?? block.extra);
  });
  act('ics', () => {
    const x = rawExtra(block);
    if (x) downloadICS(`taskmind-${x.date}.ics`, extrasICS([x]));
  });
  act('day', () => {
    close();
    state.date = key;
    setView('today');
  });
  if (!$sheet.open) $sheet.showModal();
}

// ── 시트: 추가 일정 입력 / 편집 ───────────────
function defaultTimes() {
  const n = Math.ceil(nowMinutes() / 30) * 30;
  const s = Math.min(n, 23 * 60);
  return [fromMin(s), fromMin(Math.min(s + 60, 1440))];
}

function describe(c) {
  if (c.category === 'free') {
    return c.kept.length ? `남은 시간 ${c.kept.join(', ')}` : '추가 일정에 사용됨';
  }
  if (!c.kept.length && !c.moved.length) return '오늘은 빠짐';
  const parts = [];
  if (c.kept.length) parts.push(`→ ${c.kept.join(', ')}`);
  if (c.moved.length) parts.push(`자유시간으로 이동 ${c.moved.join(', ')}`);
  if (c.lostMinutes) parts.push(`${duration(c.lostMinutes)} 줄어듦`);
  return parts.join(' · ');
}

// ── 시트: 그날 추가된 일정 목록 (월별 뷰) ─────────
function openDayExtras(key) {
  const list = getExtras()
    .filter((x) => x.date === key)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const items = list.map((x) => {
    const { before, after } = travelOf(x);
    const travel = x.travel
      ? `<span class="sub">이동 ${[before && `가는 ${duration(before)}`, after && `오는 ${duration(after)}`].filter(Boolean).join(' · ') || '없음'}</span>`
      : '';
    return `
      <li class="item tappable" style="--c:${color(x.category)}" data-id="${esc(x.id)}">
        <span class="time">${range(toMin(x.start), toMin(x.end))}</span>
        <span class="body">${catChip(x.category)}<span class="t">${esc(x.title)}</span>${travel}</span>
        <span class="chev" aria-hidden="true">›</span>
      </li>`;
  });
  $sheet.innerHTML = `
    <div class="day-extras">
      <h2>${dateLabel(key)}</h2>
      ${list.length
        ? `<p class="hint">추가된 일정 ${list.length}개 · 누르면 편집할 수 있어요</p><ol class="timeline">${items.join('')}</ol>`
        : '<p class="empty">이 날 추가된 일정이 없어요.</p>'}
      <div class="actions">
        <button type="button" class="btn" data-act="add">+ 이 날에 추가</button>
        <button type="button" class="btn" data-act="day">하루 일정 보기</button>
        <button type="button" class="btn primary" data-act="close">닫기</button>
      </div>
    </div>`;
  $sheet.querySelector('[data-act="close"]').onclick = () => $sheet.close();
  $sheet.querySelector('[data-act="add"]').onclick = () => openForm(null, key);
  $sheet.querySelector('[data-act="day"]').onclick = () => {
    $sheet.close();
    state.date = key;
    setView('today');
  };
  $sheet.querySelectorAll('.item').forEach((li) =>
    li.addEventListener('click', () => openForm(list.find((x) => String(x.id) === li.dataset.id))),
  );
  if (!$sheet.open) $sheet.showModal();
}

function openForm(extra = null, presetDate = null) {
  const [ds, de] = defaultTimes();
  const v = extra ?? {
    date: presetDate ?? (state.view === 'today' ? state.date : todayKey()),
    start: ds,
    end: de,
    title: '',
    category: 'extra',
  };
  // 고정 블록별 처리 방식. 사용자가 직접 고른 것만 기억하고, 나머지는 기본값을 쓴다.
  const chosen = { ...(extra?.resolve ?? {}) };
  const endValue = v.end === '24:00' ? '23:59' : v.end;
  $sheet.innerHTML = `
    <h2>${extra ? '일정 편집' : '새 일정 추가'}</h2>
    <form method="dialog" novalidate>
      <label>제목<input name="title" required maxlength="40" value="${esc(v.title)}" placeholder="예: 과제 제출, 팀 미팅"></label>
      <label>날짜<input name="date" type="date" required value="${v.date}"></label>
      <div class="row">
        <label>시작<input name="start" type="time" required value="${v.start}" step="300"></label>
        <label>종료<input name="end" type="time" required value="${endValue}" step="300"></label>
      </div>
      <label class="check-row"><input type="checkbox" name="travel" ${v.travel ? 'checked' : ''}> 이동 시간 포함</label>
      <div class="row travel-fields" ${v.travel ? '' : 'hidden'}>
        <label>가는 데 (분)<input name="before" type="number" inputmode="numeric" min="0" max="240" step="5" value="${travelOf(v).before || 30}"></label>
        <label>오는 데 (분)<input name="after" type="number" inputmode="numeric" min="0" max="240" step="5" value="${travelOf(v).after || 30}"></label>
      </div>
      <label>카테고리 (선택)
        <select name="category">
          ${EXTRA_CATEGORY_KEYS.map((k) => `<option value="${k}" ${k === v.category ? 'selected' : ''}>${esc(label(k))}</option>`).join('')}
        </select>
      </label>
      <label>메모 (선택)<textarea name="memo" rows="3" maxlength="1000" placeholder="장소, 준비물 등">${esc(v.memo ?? '')}</textarea></label>
      <div class="out"></div>
      <div class="actions">
        ${extra ? '<button type="button" class="btn danger" data-act="delete">삭제</button><span class="spacer"></span>' : ''}
        <button type="button" class="btn" data-act="cancel">취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>
    </form>`;

  const form = $sheet.querySelector('form');
  const out = form.querySelector('.out');
  const submit = form.querySelector('[type="submit"]');
  $sheet.querySelector('[data-act="cancel"]').onclick = () => $sheet.close();
  const del = $sheet.querySelector('[data-act="delete"]');
  if (del) {
    del.onclick = () => {
      if (!confirm(`'${extra.title}' 일정을 삭제할까요?`)) return;
      deleteExtra(extra.id);
      $sheet.close();
      render();
    };
  }

  // 입력값으로 저장할 일정과 그 결과를 계산한다.
  function evaluate() {
    const f = new FormData(form);
    let end = f.get('end');
    if (end === '23:59' || end === '00:00') end = '24:00';
    const candidate = {
      id: extra?.id ?? '__new',
      date: f.get('date'),
      start: f.get('start'),
      end,
      title: f.get('title').trim(),
      category: f.get('category') || 'extra',
    };
    const memo = (f.get('memo') ?? '').trim();
    if (memo) candidate.memo = memo;
    if (f.get('travel')) {
      const minutes = (name) => Math.min(240, Math.max(0, Math.round(Number(f.get(name)) || 0)));
      candidate.travel = { before: minutes('before'), after: minutes('after') };
    }
    if (!candidate.date || !candidate.start || !end) return { candidate, error: '날짜와 시간을 모두 입력해 주세요.' };
    if (toMin(candidate.start) >= toMin(end)) return { candidate, error: '종료 시각이 시작 시각보다 늦어야 해요.' };
    const span = spanOf(candidate);
    if (span.s < 0) return { candidate, error: `가는 이동 시간을 넣으면 0시 이전부터 시작해요. 이동 시간을 줄여 주세요.` };
    if (span.e > 24 * 60) return { candidate, error: `오는 이동 시간을 넣으면 24시를 넘어요. 이동 시간을 줄여 주세요.` };

    const others = getExtras().filter((x) => x.id !== candidate.id);
    const mine = (c) => c.extra.id === candidate.id || c.with.id === candidate.id;

    // 겹치는 고정 블록을 찾고, 각각의 처리 방식을 정한다.
    const overlapping = buildDay(candidate.date, [...others, { ...candidate, resolve: {} }]).conflicts.filter(mine);
    const clash = overlapping.filter((c) => !c.resolvable);
    const fixed = overlapping.filter((c) => c.resolvable).map((c) => {
      const block = c.extra.id === candidate.id ? c.with : c.extra;
      const x = span;
      let how = chosen[block.id] ?? defaultResolution(block, x);
      if (how === 'trim' && c.covered) how = defaultResolution(block, x);
      return { block, covered: c.covered, how };
    });
    candidate.resolve = Object.fromEntries(fixed.map((r) => [r.block.id, r.how]));
    if (!fixed.length) delete candidate.resolve;

    const before = buildDay(candidate.date, others);
    const after = buildDay(candidate.date, [...others, candidate]);
    const prev = new Set(before.changes.map((c) => JSON.stringify(c)));
    const diff = after.changes.filter((c) => !prev.has(JSON.stringify(c)));
    return { candidate, clash, fixed, diff };
  }

  function update() {
    const r = evaluate();
    submit.disabled = Boolean(r.error || r.clash?.length);
    if (r.error) {
      out.innerHTML = `<p class="msg error">${r.error}</p>`;
      return;
    }
    const html = [];
    if (r.clash.length) {
      const names = r.clash.map((c) => {
        const o = c.extra.id === r.candidate.id ? c.with : c.extra;
        return `${esc(o.title)} (${range(o.s, o.e)})`;
      });
      html.push(`<p class="msg error">다른 추가 일정과 겹쳐요: ${names.join(', ')}. 시간을 다시 골라 주세요.</p>`);
    }
    if (r.fixed.length) {
      html.push(`<div class="resolve">
        <p class="resolve-title">겹치는 고정 일정을 어떻게 할까요?</p>
        ${r.fixed.map(({ block, covered, how }) => `
          <div class="resolve-row">
            <div class="resolve-name">${catChip(block.category)} <b>${esc(block.title)}</b> <span class="muted">${range(block.s, block.e)}</span></div>
            <div class="seg" role="radiogroup" aria-label="${esc(block.title)} 처리 방식">
              ${Object.entries(RESOLUTIONS).map(([k, text]) => `
                <button type="button" role="radio" data-block="${esc(block.id)}" data-how="${k}"
                  aria-checked="${how === k}" ${k === 'trim' && covered ? 'disabled title="전부 겹쳐서 남는 시간이 없어요"' : ''}>${text}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>`);
    }
    if (!r.clash.length && r.diff.length) {
      html.push(`<p class="msg info">저장하면 그날 일정이 이렇게 바뀌어요.</p>
        <ul class="changes">
          ${r.diff.map((c) => `<li>${catChip(c.category)} <b>${esc(c.title)}</b> <span class="arrow">${c.from}</span><br>${describe(c)}</li>`).join('')}
        </ul>`);
    }
    out.innerHTML = html.join('');
    out.querySelectorAll('.seg button').forEach((btn) =>
      btn.addEventListener('click', () => {
        chosen[btn.dataset.block] = btn.dataset.how;
        update();
      }),
    );
  }

  const travelFields = form.querySelector('.travel-fields');
  form.querySelector('[name="travel"]').addEventListener('change', (e) => {
    travelFields.hidden = !e.target.checked;
  });
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = evaluate();
    if (!r.candidate.title) {
      update();
      out.insertAdjacentHTML('afterbegin', '<p class="msg error">제목을 입력해 주세요.</p>');
      form.querySelector('[name="title"]').focus();
      return;
    }
    if (r.error || r.clash.length) return update();
    const { id, ...rest } = r.candidate;
    const saved = saveExtra(extra ? { id: extra.id, ...rest } : rest);
    $sheet.close();
    state.date = saved.date;
    render();
  });

  update();
  if (!$sheet.open) $sheet.showModal();
  if (!extra) form.querySelector('[name="title"]').focus();
}

// ── 알림 ─────────────────────────────────
// 앱이 열려 있는(또는 방금 내린) 동안 일정 시작 시각에 알림을 띄운다.
// 앱이 꺼져 있을 때는 캘린더 구독(routine.ics)과 추가 일정 내보내기로 폰 캘린더가 대신 울린다.
const alarmState = { date: todayKey(), checked: nowMinutes() };
const LATE_LIMIT_MIN = 5; // 이보다 늦게 알아챈 일정은 알리지 않는다 (앱을 오래 닫아 둔 경우)

function checkAlarms() {
  const today = todayKey();
  const now = nowMinutes();
  if (alarmState.date !== today) Object.assign(alarmState, { date: today, checked: -1 });
  const since = alarmState.checked;
  alarmState.checked = now;
  if (!getSettings().notify) return;
  const { blocks } = buildDay(today, getExtras());
  const due = blocks.filter((b) => kindOf(b.category) !== 'free' && b.s > since && b.s <= now && now - b.s <= LATE_LIMIT_MIN);
  const block = due[due.length - 1];
  if (block) notify(block, blocks);
}

async function notify(block, blocks) {
  const next = blocks.find((b) => b.s >= block.e && kindOf(b.category) !== 'free');
  const memo = memoOf(block).split('\n')[0];
  const title = `지금: ${block.title}`;
  const body = [range(block.s, block.e), memo && `📝 ${memo}`, next && `다음 ${fromMin(next.s)} ${next.title}`]
    .filter(Boolean)
    .join('\n');

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body, tag: `taskmind-${block.id}`, icon: 'icons/icon.svg', badge: 'icons/icon.svg', vibrate: [200, 100, 200] };
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);
    } catch {
      /* 알림을 못 띄워도 화면 안 알림은 보여 준다 */
    }
  }
  if (document.visibilityState === 'visible') {
    showToast(title, body);
    navigator.vibrate?.([200, 100, 200]);
  }
}

function showToast(title, body) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(body).replace(/\n/g, '<br>')}</span>`;
  el.addEventListener('click', () => el.remove());
  document.body.append(el);
  setTimeout(() => el.remove(), 10_000);
}

function downloadICS(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function notifyStatus() {
  if (!('Notification' in window)) {
    return '이 브라우저는 알림을 지원하지 않아요. 아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요. 켜 두면 앱을 보고 있을 때 화면 안에 알림이 떠요.';
  }
  if (Notification.permission === 'denied') {
    return '알림 권한이 거부되어 있어요. 폰 설정에서 이 앱의 알림을 허용해 주세요. 그 전까지는 화면 안 알림만 떠요.';
  }
  return '앱이 열려 있을 때 일정이 시작되면 알림이 와요. 앱을 닫아 둬도 받으려면 아래 캘린더 연동을 함께 써 주세요.';
}

function openAlarmSettings() {
  const on = getSettings().notify;
  const routineUrl = new URL('routine.ics', location.href).href;
  const webcal = routineUrl.replace(/^https?:/, 'webcal:');
  const upcoming = upcomingExtras(getExtras());
  $sheet.innerHTML = `
    <div class="alarm-settings">
      <h2>알림 설정</h2>

      <section>
        <h3>앱 알림</h3>
        <p class="hint">${notifyStatus()}</p>
        <button type="button" class="btn ${on ? '' : 'primary'} wide" data-act="toggle">${on ? '앱 알림 끄기' : '앱 알림 켜기'}</button>
        ${on ? '<button type="button" class="btn wide" data-act="test">테스트 알림 보내기</button>' : ''}
      </section>

      <section>
        <h3>캘린더 연동 <small>앱을 닫아 둬도 알림</small></h3>
        <p class="hint">기본 루틴을 폰 캘린더에 구독하면, 일정마다 시작 시각에 캘린더 알림이 와요. 루틴이 바뀌면 캘린더에도 자동으로 반영돼요.</p>
        <a class="btn primary wide" href="${esc(webcal)}">아이폰 캘린더에 구독하기</a>
        <button type="button" class="btn wide" data-act="copy">구독 링크 복사 (구글 캘린더용)</button>
        <details>
          <summary>설정 방법</summary>
          <ul>
            <li><b>아이폰:</b> 구독 화면에서 <b>'알림 제거'를 끄고</b> 추가해야 알림이 와요.</li>
            <li><b>구글 캘린더:</b> PC에서 calendar.google.com → 다른 캘린더 + → URL로 추가 → 복사한 링크 붙여넣기. 그다음 그 캘린더의 설정에서 기본 알림을 '0분 전'으로 추가해 주세요.</li>
            <li>추가 일정 때문에 바뀐 시간(밀기·빼기)은 구독 캘린더에 반영되지 않아요. 추가 일정은 아래에서 따로 넣어 주세요.</li>
          </ul>
        </details>
        <button type="button" class="btn wide" data-act="extras" ${upcoming.length ? '' : 'disabled'}>
          추가 일정 캘린더에 넣기 (${upcoming.length}개)</button>
        <p class="hint">받은 파일을 열면 캘린더에 추가돼요. 이동 시간이 있으면 출발 시각에도 알림이 와요.</p>
      </section>

      <div class="actions"><button type="button" class="btn primary" data-act="close">닫기</button></div>
    </div>`;

  const act = (name, fn) => {
    const btn = $sheet.querySelector(`[data-act="${name}"]`);
    if (btn) btn.onclick = fn;
  };
  act('close', () => $sheet.close());
  act('toggle', async () => {
    if (!on && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* 권한 요청 실패: 화면 안 알림만 */
      }
    }
    setSettings({ notify: !on });
    openAlarmSettings();
    render();
  });
  act('test', () => {
    const block = { id: 'test', s: Math.floor(nowMinutes()), e: Math.floor(nowMinutes()) + 30, title: '테스트 알림', category: 'extra' };
    notify(block, []);
  });
  act('copy', async (e) => {
    try {
      await navigator.clipboard.writeText(routineUrl);
      e.target.textContent = '복사했어요 ✓';
    } catch {
      prompt('아래 링크를 복사해 주세요', routineUrl);
    }
  });
  act('extras', () => downloadICS('taskmind-extras.ics', extrasICS(upcoming)));
  if (!$sheet.open) $sheet.showModal();
}

// ── 공통 ─────────────────────────────────
function setView(view) {
  state.view = view;
  if (view === 'week') state.week = weekStart(state.date);
  if (view === 'month') state.month = state.date.slice(0, 7);
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.view === state.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  ({ today: renderToday, week: renderWeek, month: renderMonth })[state.view]();
}

document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.getElementById('add-btn').addEventListener('click', () => openForm());
$sheet.addEventListener('click', (e) => {
  if (e.target === $sheet) $sheet.close(); // 바깥 영역 탭하면 닫기
});

// 실시간 갱신: 날짜가 바뀌었으면 '오늘'을 따라간다.
let lastToday = todayKey();
function tick() {
  const t = todayKey();
  if (t !== lastToday) {
    if (state.date === lastToday) state.date = t;
    lastToday = t;
  }
  checkAlarms();
  if (!$sheet.open) render();
}
setInterval(tick, REFRESH_MS);
setInterval(checkAlarms, ALARM_CHECK_MS);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());

render();

// 새 버전이 배포되면 알아서 받아와 다시 불러온다.
// 홈 화면 앱은 닫았다 열어도 새로고침되지 않을 수 있어서, 앱으로 돌아올 때마다 업데이트를 확인한다.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || $sheet.open) return; // 첫 설치 때와 입력 중에는 새로고침하지 않는다
    reloaded = true;
    location.reload();
  });
}
