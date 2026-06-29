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
    <div className="px-4 sm:px-6 pb-5 sm:pb-6">
      <div className="mb-3">
        <p className="text-[9px] text-white/20 uppercase tracking-widest">
          Tap an instructor to view their availability grid
        </p>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {isLoading ? (
          <SkeletonRow />
        ) : instructors.length === 0 ? (
          <div className="text-center py-8 text-white/20 text-xs">
            No instructors found for this section and semester.
          </div>
        ) : (
          instructors.map(i => (
            <button
              key={i.id}
              onClick={() => onSelectInstructor(i)}
              className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-blue-500/30 transition-all text-left"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  availabilityMap[i.id]
                    ? 'bg-green-500'
                    : 'bg-orange-500 animate-pulse'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{i.name}</p>
                  <p className="text-[10px] opacity-30 uppercase">{i.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  availabilityMap[i.id]
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-orange-500/10 text-orange-400'
                }`}>
                  {availabilityMap[i.id] ? 'Done' : 'Pending'}
                </span>
                <span className="text-white/20 text-xs">›</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}