export function MetricCard({ main, label, sub }: { main: string; label: string; sub: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100">
      <p className="text-xs text-stone-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900 mb-1">{main}</p>
      <p className="text-xs text-stone-400">{sub}</p>
    </div>
  );
}
