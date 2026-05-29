const SkeletonRow = () => (
  <div className="h-12 w-full bg-white/5 rounded-xl animate-pulse mb-2 border border-white/5" />
);

export default function InstructorStatusPanel({
  instructors,
  availabilityMap,
  isLoading,
  onSelectInstructor,
}) {
  return (
    <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10">
      <div className="mb-4">
        <h3 className="font-bold uppercase text-[11px] tracking-widest text-white/40">
          Instructor Status
        </h3>
        <p className="text-[9px] text-white/20 uppercase tracking-widest mt-1">
          Click an instructor to view their availability grid
        </p>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {isLoading
          ? <SkeletonRow />
          : instructors.map(i => (
            <button
              key={i.id}
              onClick={() => onSelectInstructor(i)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-blue-500/30 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  availabilityMap[i.id]
                    ? 'bg-green-500'
                    : 'bg-orange-500 animate-pulse'
                }`} />
                <div>
                  <p className="text-xs font-semibold text-white">{i.name}</p>
                  <p className="text-[10px] opacity-30 uppercase">{i.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  availabilityMap[i.id]
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-orange-500/10 text-orange-400'
                }`}>
                  {availabilityMap[i.id] ? 'Submitted' : 'Pending'}
                </span>
                <span className="text-white/20 text-xs">›</span>
              </div>
            </button>
          ))
        }
      </div>
    </div>
  );
}