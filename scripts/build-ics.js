// 기본 루틴 구독 파일(routine.ics)을 js/data.js에서 다시 만든다. 기본 일정을 바꾸면 실행: npm run ics
import { writeFileSync } from 'node:fs';
import { routineICS } from '../js/ics.js';

writeFileSync(new URL('../routine.ics', import.meta.url), routineICS());
console.log('routine.ics 갱신');
