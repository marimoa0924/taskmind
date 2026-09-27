# 작업 규칙

- 사이트는 GitHub Pages(`main` 브랜치, 루트 폴더)로 배포된다: https://marimoa0924.github.io/taskmind/
- 기능을 수정하면 `npm test`가 통과하는지 확인한 뒤 **매번 `main`에 바로 푸시**한다 (사용자 요청). PR은 만들지 않는다.
- 배포할 때마다 `js/app.js`의 `APP_VERSION`과 `sw.js`의 `CACHE` 이름을 함께 올린다.
  월별 화면 하단에 버전이 보이므로, 폰에 새 버전이 떴는지 이걸로 확인할 수 있다.
- 빌드 과정 없는 정적 웹앱(ES 모듈). 일정 계산 로직은 `js/schedule.js`, 기본 일정은 `js/data.js`.
- 기본 일정(`js/data.js`)을 바꾸면 `npm run ics`로 캘린더 구독 파일 `routine.ics`도 다시 만든다 (`npm test`가 확인).
