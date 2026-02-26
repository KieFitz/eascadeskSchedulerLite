const variants = {
  primary:   'bg-brand-purple hover:bg-brand-purple-light text-white shadow-soft',
  secondary: 'bg-white border border-gray-200 text-dark hover:bg-gray-50',
  danger:    'bg-red-500 hover:bg-red-600 text-white shadow-soft',
  ghost:     'text-brand-purple hover:bg-brand-lavender-light',
  teal:      'bg-brand-teal hover:bg-brand-teal-light text-dark shadow-soft',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  disabled = false,
  ...props
}) {
  return (
    <button
      className={[
        'inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      ].join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  )
}
