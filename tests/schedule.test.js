import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKLY_BLOCKS } from '../js/data.js';
import { buildDay, defaultResolution, locate, toMin, weekStart, fromMin } from '../js/schedule.js';

// 2026-09-28 = 월, 2026-09-29 = 화, 2026-10-03 = 토
const MON = '2026-09-28';
const TUE = '2026-09-29';
const SAT = '2026-10-03';

const find = (blocks, title) => blocks.filter((b) => b.title === title);

test('모든 요일이 빈틈·겹침 없이 이어진다', () => {
  for (let day = 0; day < 7; day++) {
    const blocks = WEEKLY_BLOCKS.filter((b) => b.day === day);
    assert.ok(blocks.length > 0);
    for (let i = 1; i < blocks.length; i++) {
      assert.equal(blocks[i].start, blocks[i - 1].end, `day ${day} #${i}`);
    }
  }
});

test('24:00은 1440분으로 처리된다', () => {
  assert.equal(toMin('24:00'), 1440);
  assert.equal(fromMin(1440), '24:00');
});

test('weekStart는 월요일을 돌려준다', () => {
  assert.equal(weekStart('2026-09-27'), '2026-09-21'); // 일요일 → 이전 월요일
  assert.equal(weekStart(MON), MON);
  assert.equal(weekStart(SAT), MON);
});

test('추가 일정이 없으면 기본 일정 그대로', () => {
  const { blocks, conflicts, changes } = buildDay(MON, []);
  assert.equal(blocks.length, 15);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(changes, []);
});

test('고정 블록과 겹치면 충돌', () => {
  const extra = { id: 1, date: MON, start: '12:00', end: '12:45', title: '약속', category: 'extra' };
  const { conflicts } = buildDay(MON, [extra]);
  assert.deepEqual(conflicts.map((c) => c.with.title), ['유빈쌤 수업 (온라인)', '점심']);
});

test('청소·운동·자기관리도 고정 블록이다', () => {
  for (const [start, end] of [['10:45', '10:50'], ['19:30', '20:00'], ['21:10', '21:20']]) {
    const extra = { id: 1, date: MON, start, end, title: 'x', category: 'extra' };
    assert.equal(buildDay(MON, [extra]).conflicts.length, 1, `${start}`);
  }
});

test('추가 일정끼리 겹치면 충돌', () => {
  const a = { id: 1, date: MON, start: '09:00', end: '10:00', title: 'a', category: 'extra' };
  const b = { id: 2, date: MON, start: '09:30', end: '10:30', title: 'b', category: 'extra' };
  assert.equal(buildDay(MON, [a, b]).conflicts.length, 1);
});

test('자유시간이 있으면 밀려난 유동 블록을 자유시간으로 옮긴다', () => {
  // 화요일 14:30–18:00 영어 공부 중 15:00–15:30을 차지 → 30분이 21:30–22:00 자유 시간으로 이동
  const extra = { id: 1, date: TUE, start: '15:00', end: '15:30', title: '팀 미팅', category: 'extra' };
  const { blocks, conflicts, changes } = buildDay(TUE, [extra]);
  assert.deepEqual(conflicts, []);
  const eng = find(blocks, '영어 공부').filter((b) => b.s >= toMin('14:30'));
  assert.deepEqual(eng.map((b) => [fromMin(b.s), fromMin(b.e), !!b.moved]), [
    ['14:30', '15:00', false],
    ['15:30', '18:00', false],
    ['21:30', '22:00', true],
  ]);
  assert.equal(find(blocks, '자유 시간').length, 0);
  const engChange = changes.find((c) => c.from === '14:30–18:00');
  assert.deepEqual(engChange.moved, ['21:30–22:00']);
  assert.equal(engChange.lostMinutes, 0);
});

test('뒤쪽 자유시간이 없으면 앞쪽 자유시간을 쓴다', () => {
  // 화요일 21:30–22:00 자유시간을 추가 일정이 차지한 뒤, 영어 공부 15분을 밀어냄 → 11:45 쉬는 시간으로
  const a = { id: 1, date: TUE, start: '21:30', end: '22:00', title: '통화', category: 'extra' };
  const b = { id: 2, date: TUE, start: '17:45', end: '18:00', title: '메일', category: 'extra' };
  const { blocks } = buildDay(TUE, [a, b]);
  const moved = blocks.filter((x) => x.moved);
  assert.deepEqual(moved.map((x) => [x.title, fromMin(x.s), fromMin(x.e)]), [['영어 공부', '11:45', '12:00']]);
});

test('자유시간이 모자라면 남는 만큼 단축한다', () => {
  // 월요일은 자유시간이 없다 → 영어 공부 13:00–14:00 중 30분 단축
  const extra = { id: 1, date: MON, start: '13:00', end: '13:30', title: '과제 제출', category: 'extra' };
  const { blocks, changes } = buildDay(MON, [extra]);
  const eng = find(blocks, '영어 공부').find((b) => b.e === toMin('14:00'));
  assert.equal(fromMin(eng.s), '13:30');
  const c = changes.find((x) => x.from === '13:00–14:00');
  assert.deepEqual(c.kept, ['13:30–14:00']);
  assert.equal(c.lostMinutes, 30);
});

test('자유시간과만 겹치면 자유시간만 줄어든다', () => {
  const extra = { id: 1, date: SAT, start: '23:30', end: '24:00', title: '통화', category: 'extra' };
  const { blocks, changes } = buildDay(SAT, [extra]);
  assert.deepEqual(find(blocks, '자유 시간').map((b) => fromMin(b.e)), ['23:30']);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].category, 'free');
});

test('일정 바깥 시간(취침 후)에도 추가할 수 있다', () => {
  const extra = { id: 1, date: MON, start: '22:30', end: '23:00', title: '야식', category: 'meal' };
  const { blocks, conflicts } = buildDay(MON, [extra]);
  assert.deepEqual(conflicts, []);
  assert.equal(blocks.at(-1).title, '야식');
});

test('locate: 기상 전 / 진행 중 / 종료 후', () => {
  const { blocks } = buildDay(MON, []);
  assert.equal(locate(blocks, toMin('07:00')).phase, 'before');
  assert.equal(locate(blocks, toMin('07:00')).next.title, '세면');
  const mid = locate(blocks, toMin('09:00'));
  assert.equal(mid.current.title, '영어 공부');
  assert.equal(mid.next.title, '방 청소');
  assert.equal(locate(blocks, toMin('22:30')).phase, 'after');
});

// ── 고정 블록과 겹칠 때 처리 방식 ─────────────────
const SUN = '2026-09-27';
const dinner = (resolve) => ({ id: 1, date: SUN, start: '18:00', end: '21:00', title: '홍보부 회식', category: 'extra', resolve });
const at = (blocks) => blocks.filter((b) => !b.extra).map((b) => `${fromMin(b.s)}-${fromMin(b.e)} ${b.title}`);

test('처리 방식이 없으면 해결 가능한 충돌로 알려준다', () => {
  const { conflicts } = buildDay(SUN, [dinner()]);
  assert.deepEqual(conflicts.map((c) => [c.with.title, c.resolvable, c.covered]), [
    ['저녁', true, true],
    ['운동', true, true],
  ]);
});

test('defaultResolution: 부분 겹침은 남기기, 다 가려진 식사는 빼기, 나머지는 밀기', () => {
  const x = { s: toMin('18:00'), e: toMin('21:00') };
  assert.equal(defaultResolution({ s: toMin('17:00'), e: toMin('18:30'), category: 'class' }, x), 'trim');
  assert.equal(defaultResolution({ s: toMin('18:30'), e: toMin('19:00'), category: 'meal' }, x), 'skip');
  assert.equal(defaultResolution({ s: toMin('19:00'), e: toMin('21:00'), category: 'exercise' }, x), 'push');
});

test('빼기 + 뒤로 밀기: 뒤 일정이 줄줄이 밀리고 유동·자유시간이 먼저 흡수한다', () => {
  const { blocks, conflicts, changes } = buildDay(SUN, [dinner({ 'b0-7': 'skip', 'b0-8': 'push' })]);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(at(blocks).slice(-5), [
    '13:30-16:30 작업 시간 (희곡·3D모델링·커미션 등)',
    '16:30-18:00 영어 공부',
    '21:00-23:00 운동',
    '23:00-23:40 밤 씻기',
    '23:40-24:00 스킨케어',
  ]);
  const byTitle = Object.fromEntries(changes.map((c) => [c.title, c]));
  assert.equal(byTitle['저녁'].lostMinutes, 30);
  assert.equal(byTitle['독서'].lostMinutes, 60);
  assert.ok(blocks.find((b) => b.title === '운동').shifted);
});

test('남는 시간만: 겹치지 않는 부분만 남긴다', () => {
  const x = { id: 1, date: MON, start: '12:00', end: '12:45', title: '약속', category: 'extra', resolve: { 'b1-4': 'trim', 'b1-5': 'trim' } };
  const { blocks, conflicts } = buildDay(MON, [x]);
  assert.deepEqual(conflicts, []);
  assert.ok(at(blocks).includes('11:00-12:00 유빈쌤 수업 (온라인)'));
  assert.ok(at(blocks).includes('12:45-13:00 점심'));
});

test('밀린 블록은 다른 추가 일정을 건너뛴다', () => {
  const a = { id: 1, date: MON, start: '19:00', end: '20:00', title: 'a', category: 'extra', resolve: { 'b1-12': 'push' } };
  const b = { id: 2, date: MON, start: '22:00', end: '22:30', title: 'b', category: 'extra' };
  const { blocks } = buildDay(MON, [a, b]);
  // 운동 19–21 → 20–22, 밤 씻기 21–21:40 → 22:30–23:10(추가 일정 b를 건너뜀), 스킨케어 → 23:10–23:30
  assert.deepEqual(at(blocks).slice(-3), ['20:00-22:00 운동', '22:30-23:10 밤 씻기', '23:10-23:30 스킨케어']);
});
