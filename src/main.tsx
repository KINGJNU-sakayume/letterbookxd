import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startLogSync } from './lifehub/logSyncController';

// 독서 기록 기기 동기화 (설정에서 켠 기기만 동작한다)
startLogSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
