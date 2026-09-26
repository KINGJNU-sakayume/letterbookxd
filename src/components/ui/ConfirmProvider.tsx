import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { ConfirmContext, type ConfirmOptions } from './confirm';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ''}
        description={options?.description}
        size="sm"
        hideClose
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => settle(false)}>
              {options?.cancelLabel ?? '취소'}
            </button>
            <button
              type="button"
              data-autofocus
              className={`btn ${options?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? '확인'}
            </button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}
