import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map<string, number>();

/**
 * 새 화면은 맨 위에서, 뒤로 가기는 떠났던 위치에서 시작한다.
 * 목록 필터처럼 주소만 바꾸는 이동(replace)은 위치를 그대로 둔다.
 */
export function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    keyRef.current = location.key;
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.set(keyRef.current, window.scrollY));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    if (navType === 'REPLACE') return;
    const saved = navType === 'POP' ? positions.get(location.key) : undefined;
    if (saved === undefined) {
      window.scrollTo(0, 0);
      return;
    }
    // 내용이 늦게 그려지는 화면을 위해 잠시 동안 다시 맞춘다
    let tries = 0;
    let frame = 0;
    const restore = () => {
      window.scrollTo(0, saved);
      if (Math.abs(window.scrollY - saved) > 2 && tries++ < 30) frame = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(frame);
  }, [location.key, navType]);

  return null;
}
