export const inputClass = "w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none text-white";
export const selectClass = "w-full bg-[#0a1628] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none text-white";
export const labelClass = "block text-[11px] uppercase tracking-widest text-white/40 mb-1";

// Extracts a readable error message from an Axios error response
export const getErrorMessage = (e) => {
  const detail = e.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg).join(', ');
  if (typeof detail === 'string') return detail;
  return 'An error occurred.';
};

// Generic modal overlay used by all tabs
export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a1628] border border-white/10 rounded-[2rem] p-8 w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Labeled form field wrapper
export function FormField({ label, children }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}
