# Ledger 앱 오류 리포트

---

## 2026-03-26

### 1. 탭바 미표시
- **원인** `app/(tabs)/index.tsx`, `archive.tsx`, `settings.tsx` 파일이 비어있어 컴포넌트 export 없음
- **해결** 각 파일에 기본 컴포넌트 추가

### 2. 앱 진입점 오류
- **원인** `package.json`의 `"main"` 필드가 `"index.ts"`로 설정되어 expo-router 대신 구버전 `App.tsx` 방식으로 실행됨
- **해결** `"main": "expo-router/entry"` 로 변경

### 3. `expo-linking` 미설치
- **원인** `expo-router`가 의존하는 `expo-linking` 패키지가 `node_modules`에 없음
- **해결** `npm install expo-linking --legacy-peer-deps`

### 4. `scheme` 미설정
- **원인** `app.json`에 `scheme` 필드 없음 — expo-router의 딥링크 초기화 시 필수값
- **해결** `app.json`에 `"scheme": "ledger"` 추가

---

## 2026-03-27

### 1. `react-dom/client` 미설치
- **원인** `@expo/log-box`가 `react-dom`을 필요로 하지만 설치되지 않음
- **해결** `npm install react-dom@19.2.0 --legacy-peer-deps`

---

## 공통 사항

프로젝트 내 `react-dom@19.2.4` peer dependency 충돌로 인해 `npx expo install` 명령이 동작하지 않음  
→ 모든 패키지 설치 시 아래 명령 사용 필요

```bash
npm install <패키지명> --legacy-peer-deps
```
