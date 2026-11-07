import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startLogSync } from './lifehub/logSyncController';
import { startBoardUpload } from './board/start';

// 독서 기록 기기 동기화 (Life Hub에 동기화 권한으로 연결된 기기에서 동작한다)
startLogSync();
// Life Board 타일 목록 올리기 (시작 동기화가 끝난 뒤에 올린다)
startBoardUpload();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
