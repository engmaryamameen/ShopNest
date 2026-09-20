function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m10 1.7 2.55 5.17 5.7.83-4.12 4.02.97 5.68L10 14.72 4.9 17.4l.97-5.68L1.75 7.7l5.7-.83L10 1.7Z" />
    </svg>
  );
}

export function StarRating({ average, count }: { average: number; count: number }) {
  if (count === 0) {
    return <p className="text-sm text-gray-400">No reviews yet</p>;
  }
  return (
    <div className="flex items-center gap-2" aria-label={`${average.toFixed(1)} out of 5 stars, ${count} reviews`}>
      <div className="flex text-[#ffad33]" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} filled={i < Math.round(average)} />
        ))}
      </div>
      <span className="text-sm text-gray-600">
        {average.toFixed(1)} ({count} review{count === 1 ? '' : 's'})
      </span>
    </div>
  );
}
