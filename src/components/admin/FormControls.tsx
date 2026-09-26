import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface StatusMsg {
  type: 'success' | 'error';
  text: string;
}

export function Field({ label, name, value, onChange, placeholder }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      <input type="text" name={name} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400" />
    </div>
  );
}

export function TextArea({ label, name, value, onChange, placeholder, rows }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} rows={rows ?? 3}
        className="w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 overflow-hidden resize-none min-h-[100px]" />
    </div>
  );
}

export function StatusDisplay({ status }: { status: StatusMsg | null }) {
  if (!status) return null;
  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
      {status.type === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
      {status.text}
    </div>
  );
}
