import { useId, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface StatusMsg {
  type: 'success' | 'error';
  text: string;
}

export function Field({ label, name, value, onChange, placeholder, hint, required, type = 'text', inputMode }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  type?: 'text' | 'url' | 'number';
  inputMode?: 'numeric' | 'text' | 'url';
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-seal" aria-hidden>*</span>}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="field"
      />
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, name, value, onChange, placeholder, rows, hint }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows ?? 4}
        className="field min-h-[112px] resize-y font-serif text-[15.5px] leading-[1.8]"
      />
      {hint && <p className="mt-1.5 text-[12.5px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, name, value, onChange, children, disabled, hint }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <select id={id} name={name} value={value} onChange={onChange} disabled={disabled} className="field-select">
        {children}
      </select>
      {hint && <p className="mt-1.5 text-[12.5px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export function StatusDisplay({ status }: { status: StatusMsg | null }) {
  if (!status) return null;
  return (
    <div
      role={status.type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-[5px] border px-3.5 py-2.5 text-[14px] ${
        status.type === 'success'
          ? 'border-completed-border bg-completed-light text-completed-dark'
          : 'border-seal/25 bg-seal-soft text-seal-dark'
      }`}
    >
      {status.type === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
      {status.text}
    </div>
  );
}

/** 폼 제목과 짧은 설명 */
export function FormHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 border-b border-line pb-4">
      <h2 className="font-serif text-[22px] font-bold text-ink">{title}</h2>
      {description && <p className="mt-1 text-[14px] text-ink-muted">{description}</p>}
    </div>
  );
}
