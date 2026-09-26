import { createContext, useContext, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

// Provider 밖에서 쓰이면 브라우저 기본 확인창으로 대신한다
export const ConfirmContext = createContext<ConfirmFn>((options) =>
  Promise.resolve(window.confirm(options.title)),
);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
