// 캘린더(.ics) 파일 만들기. 폰 기본 캘린더가 알림을 대신 울려 주므로 앱이 꺼져 있어도 알람이 온다.
// 브라우저(추가 일정 내보내기)와 Node(scripts/build-ics.js, 기본 루틴 구독 파일) 양쪽에서 쓴다.
import { CATEGORIES, WEEKLY_BLOCKS } from './data.js';
import { addDays, dateKey, toMin } from './schedule.js';

const TZ = 'Asia/Seoul';
// 기본 루틴 반복이 시작되는 주의 월요일. 구독 파일 내용이 매번 같도록 고정값을 쓴다.
export const ROUTINE_ANCHOR = '2026-09-28';
const FIXED_STAMP = '20260927T000000Z';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'TZNAME:KST',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 한 줄은 75바이트를 넘지 않게 접는다 (한글은 3바이트).
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // 이어지는 줄은 앞의 공백 1바이트 포함
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ` ${l}` : l)).join('\r\n');
}

// "YYYY-MM-DD" + 분 → 20260928T084000 (분이 1440이면 다음 날 00:00)
function localStamp(key, min) {
  const day = addDays(key, Math.floor(min / 1440));
  const m = min % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${day.replace(/-/g, '')}T${hh}${mm}00`;
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function alarm(minutesBefore, text) {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(text)}`,
    `TRIGGER:${minutesBefore ? `-PT${minutesBefore}M` : 'PT0M'}`,
    'END:VALARM',
  ];
}

function calendar(name, events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//taskmind//하루 루틴//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE,
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** 요일별 기본 루틴: 매주 반복, 시작 시각에 알림. 자유시간은 넣지 않는다. */
export function routineICS() {
  const events = WEEKLY_BLOCKS.filter((b) => b.category !== 'free').map((b) => {
    const offset = (b.day + 6) % 7; // 월요일 기준
    const key = addDays(ROUTINE_ANCHOR, offset);
    const label = CATEGORIES[b.category]?.label ?? b.category;
    return [
      'BEGIN:VEVENT',
      `UID:${b.id}@taskmind`,
      `DTSTAMP:${FIXED_STAMP}`,
      `DTSTART;TZID=${TZ}:${localStamp(key, toMin(b.start))}`,
      `DTEND;TZID=${TZ}:${localStamp(key, toMin(b.end))}`,
      'RRULE:FREQ=WEEKLY',
      `SUMMARY:${escapeText(b.title)}`,
      `CATEGORIES:${escapeText(label)}`,
      ...alarm(0, `지금: ${b.title}`),
      'END:VEVENT',
    ];
  });
  return calendar('하루 루틴', events);
}

/** 추가 일정 내보내기: 시작 시각 알림, 이동 시간이 있으면 출발 시각에도 알림 */
export function extrasICS(extras, now = new Date()) {
  const events = extras.map((x) => {
    const before = Number(x.travel?.before) || 0;
    const after = Number(x.travel?.after) || 0;
    const desc = [
      x.memo,
      before ? `가는 이동 ${before}분` : '',
      after ? `오는 이동 ${after}분` : '',
    ].filter(Boolean).join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:extra-${x.id}@taskmind`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;TZID=${TZ}:${localStamp(x.date, toMin(x.start))}`,
      `DTEND;TZID=${TZ}:${localStamp(x.date, toMin(x.end))}`,
      `SUMMARY:${escapeText(x.title)}`,
      ...(desc ? [`DESCRIPTION:${escapeText(desc)}`] : []),
      ...(before ? alarm(before, `출발할 시간: ${x.title}`) : []),
      ...alarm(0, `지금: ${x.title}`),
      'END:VEVENT',
    ];
  });
  return calendar('하루 루틴 추가 일정', events);
}

/** 오늘 이후의 추가 일정만 */
export function upcomingExtras(extras, today = dateKey(new Date())) {
  return extras.filter((x) => x.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

