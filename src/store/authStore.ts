import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  /** 첫 세션 확인이 끝났는지 여부 */
  ready: boolean;
  start: () => () => void;
  signOut: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  ready: false,

  start: () => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) set({ session: data.session, ready: true });
      })
      .catch(() => {
        if (active) set({ session: null, ready: true });
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, ready: true });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return !error;
  },
}));

/** 권한 판정은 사용자가 바꿀 수 없는 app_metadata만 본다. */
export function isAdminSession(session: Session | null): boolean {
  return session?.user.app_metadata?.role === 'admin';
}
