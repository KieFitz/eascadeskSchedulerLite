export default function Input({
  label,
  error,
  required,
  className = '',
  ...props
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-dark">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        className={[
          'w-full rounded-lg border px-3 py-2 text-sm text-dark placeholder-muted',
          'focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent',
          'transition-colors duration-150',
          error ? 'border-red-400' : 'border-gray-200',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
