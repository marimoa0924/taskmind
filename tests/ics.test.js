import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extrasICS, routineICS, upcomingExtras } from '../js/ics.js';
import { WEEKLY_BLOCKS } from '../js/data.js';

test('routine.ics가 js/data.js와 맞다 (다르면 npm run ics)', () => {
  const file = readFileSync(new URL('../routine.ics', import.meta.url), 'utf8');
  assert.equal(file, routineICS());
});

test('기본 루틴: 자유시간 빼고 매주 반복, 시작 시각 알림', () => {
  const ics = routineICS();
  const count = (re) => (ics.match(re) ?? []).length;
  const n = WEEKLY_BLOCKS.filter((b) => b.category !== 'free').length;
  assert.equal(count(/BEGIN:VEVENT/g), n);
  assert.equal(count(/RRULE:FREQ=WEEKLY/g), n);
  assert.equal(count(/TRIGGER:PT0M/g), n);
  // 화요일 06:30 세면 → 2026-09-29
  assert.match(ics, /UID:b2-0@taskmind\r\nDTSTAMP:\d+T\d+Z\r\nDTSTART;TZID=Asia\/Seoul:20260929T063000/);
  // 토요일 23:20 자유 시간은 넣지 않는다
  assert.doesNotMatch(ics, /DTSTART;TZID=Asia\/Seoul:20261003T232000/);
  assert.match(ics, /DTSTART;TZID=Asia\/Seoul:20261003T223000\r\nDTEND;TZID=Asia\/Seoul:20261003T232000/);
});

test('모든 줄이 75바이트 이하이고 CRLF로 끝난다', () => {
  const ics = extrasICS([{ id: 'z', date: '2026-10-01', start: '10:00', end: '11:00', title: '아주 긴 제목'.repeat(10), category: 'extra', memo: '메모, 쉼표\; 세미콜론\n줄바꿈' }]);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(ics.endsWith('\r\n'));
  assert.match(ics.replace(/\r\n /g, ''), /DESCRIPTION:메모\\, 쉼표\\; 세미콜론\\n줄바꿈/);
});

test('추가 일정: 이동 시간이 있으면 출발 알림도 붙는다', () => {
  const ics = extrasICS([{ id: 'a', date: '2026-10-01', start: '18:30', end: '24:00', title: '회식', category: 'extra', travel: { before: 40, after: 0 } }]);
  assert.match(ics, /TRIGGER:-PT40M/);
  assert.match(ics, /TRIGGER:PT0M/);
  assert.match(ics, /DTEND;TZID=Asia\/Seoul:20261002T000000/);
});

test('upcomingExtras는 오늘 이후만 날짜순으로', () => {
  const xs = [
    { id: 1, date: '2026-09-20', start: '10:00' },
    { id: 2, date: '2026-10-02', start: '09:00' },
    { id: 3, date: '2026-09-27', start: '12:00' },
  ];
  assert.deepEqual(upcomingExtras(xs, '2026-09-27').map((x) => x.id), [3, 2]);
});
