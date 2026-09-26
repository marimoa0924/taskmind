// 카테고리 정의: 어두운 저채도 파랑 계열 팔레트.
// kind: fixed(겹치면 저장 불가) · flexible(겹치면 자유시간으로 밀거나 단축) · free(빈 칸)
export const CATEGORIES = {
  class:    { label: '수업',     color: '#2f4a6b', kind: 'fixed' },
  commute:  { label: '통학',     color: '#4a5a6e', kind: 'fixed' },
  meal:     { label: '식사',     color: '#3a5f6e', kind: 'fixed' },
  english:  { label: '영어',     color: '#434a78', kind: 'flexible' },
  clean:    { label: '청소',     color: '#56677d', kind: 'fixed' },
  exercise: { label: '운동',     color: '#2d5660', kind: 'fixed' },
  selfcare: { label: '자기관리', color: '#5a5f82', kind: 'fixed' },
  work:     { label: '작업',     color: '#35416a', kind: 'flexible' },
  reading:  { label: '독서',     color: '#4e6a8a', kind: 'flexible' },
  free:     { label: '자유시간', color: 'transparent', kind: 'free' },
  extra:    { label: '일정 추가', color: '#6b6f95', kind: 'fixed' },
};

// 추가 일정 입력 시 고를 수 있는 카테고리 (free 제외)
export const EXTRA_CATEGORY_KEYS = Object.keys(CATEGORIES).filter((k) => k !== 'free');

const raw = {
  // 월
  1: `08:00 08:10 세면|selfcare
08:10 08:40 아침 식사 + 영양제·약|meal
08:40 10:40 영어 공부|english
10:40 11:00 방 청소|clean
11:00 12:30 유빈쌤 수업 (온라인)|class
12:30 13:00 점심|meal
13:00 14:00 영어 공부|english
14:00 15:30 연극과 문화 (온라인)|class
15:30 17:00 여성 커리어 개발 (온라인)|class
17:00 18:00 영어 공부|english
18:00 18:30 저녁|meal
18:30 19:00 독서|reading
19:00 21:00 운동|exercise
21:00 21:40 밤 씻기|selfcare
21:40 22:00 스킨케어|selfcare`,
  // 화
  2: `06:30 06:40 세면|selfcare
06:40 07:10 아침 식사 + 영양제·약|meal
07:10 07:30 방 청소|clean
07:30 08:00 영어 공부|english
08:00 09:00 등교|commute
09:00 11:45 컴퓨터교육개론|class
11:45 12:00 쉬는 시간|free
12:00 13:00 인공지능기반 3D콘텐츠개발|class
13:00 13:30 점심|meal
13:30 14:30 하교 (이동 중 독서)|commute
14:30 18:00 영어 공부|english
18:00 18:30 저녁|meal
18:30 20:30 운동|exercise
20:30 21:10 밤 씻기|selfcare
21:10 21:30 스킨케어|selfcare
21:30 22:00 자유 시간|free`,
  // 수
  3: `08:00 08:10 세면|selfcare
08:10 08:40 아침 식사 + 영양제·약|meal
08:40 10:40 영어 공부|english
10:40 11:00 방 청소|clean
11:00 12:30 영어 공부|english
12:30 13:00 점심|meal
13:00 13:30 영어 공부|english
13:30 14:00 독서|reading
14:00 15:00 등교|commute
15:00 16:00 알고리즘|class
16:00 17:00 컴퓨터보안|class
17:00 18:00 하교|commute
18:00 18:30 저녁|meal
18:30 20:30 운동|exercise
20:30 21:10 밤 씻기|selfcare
21:10 21:30 스킨케어|selfcare
21:30 22:00 자유 시간|free`,
  // 목
  4: `08:00 08:10 세면|selfcare
08:10 08:40 아침 식사 + 영양제·약|meal
08:40 10:40 영어 공부|english
10:40 11:00 방 청소|clean
11:00 11:30 영어 공부|english
11:30 12:00 점심|meal
12:00 13:00 등교|commute
13:00 14:30 교육학개론|class
14:30 15:00 영어 공부 (쉬는 시간)|english
15:00 16:15 교육방법및교육공학|class
16:15 17:15 하교 (이동 중 독서)|commute
17:15 18:15 영어 공부|english
18:15 18:45 저녁|meal
18:45 20:45 운동|exercise
20:45 21:25 밤 씻기|selfcare
21:25 21:45 스킨케어|selfcare
21:45 22:00 자유 시간|free`,
  // 금
  5: `08:00 08:10 세면|selfcare
08:10 08:40 아침 식사 + 영양제·약|meal
08:40 10:40 영어 공부|english
10:40 11:00 방 청소|clean
11:00 12:30 영어 공부|english
12:30 13:00 점심|meal
13:00 13:30 영어 공부|english
13:30 14:00 독서|reading
14:00 15:00 등교|commute
15:00 17:00 머신러닝|class
17:00 18:00 하교|commute
18:00 18:30 저녁|meal
18:30 20:30 운동|exercise
20:30 21:10 밤 씻기|selfcare
21:10 21:30 스킨케어|selfcare
21:30 22:00 자유 시간|free`,
  // 토
  6: `10:00 10:10 세면|selfcare
10:10 10:40 아침 식사 + 영양제·약|meal
10:40 11:40 영어 공부|english
11:40 12:10 점심|meal
12:10 12:30 방 청소|clean
12:30 13:30 영어 공부|english
13:30 14:00 화장실 청소|clean
14:00 17:00 작업 시간 (희곡·3D모델링·커미션 등)|work
17:00 19:00 영어 공부|english
19:00 19:30 저녁|meal
19:30 21:30 운동|exercise
21:30 22:10 밤 씻기|selfcare
22:10 22:30 스킨케어|selfcare
22:30 23:20 독서|reading
23:20 24:00 자유 시간|free`,
  // 일
  0: `10:00 10:10 세면|selfcare
10:10 10:40 아침 식사 + 영양제·약|meal
10:40 12:40 영어 공부|english
12:40 13:00 방 청소|clean
13:00 13:30 점심|meal
13:30 16:30 작업 시간 (희곡·3D모델링·커미션 등)|work
16:30 18:30 영어 공부|english
18:30 19:00 저녁|meal
19:00 21:00 운동|exercise
21:00 21:40 밤 씻기|selfcare
21:40 22:00 스킨케어|selfcare
22:00 23:00 독서|reading
23:00 24:00 자유 시간|free`,
};

// 요일별 고정 블록: { id, day, start, end, title, category }
export const WEEKLY_BLOCKS = Object.entries(raw).flatMap(([day, text]) =>
  text.split('\n').map((line, i) => {
    const [time, category] = line.split('|');
    const [start, end, ...title] = time.split(' ');
    return { id: `b${day}-${i}`, day: Number(day), start, end, title: title.join(' '), category };
  }),
);
