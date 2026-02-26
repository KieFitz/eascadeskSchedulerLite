const colours = {
  purple: 'bg-brand-lavender text-brand-purple',
  teal:   'bg-brand-teal/20 text-teal-700',
  green:  'bg-green-100 text-green-700',
  amber:  'bg-amber-100 text-amber-700',
  red:    'bg-red-100 text-red-600',
  gray:   'bg-gray-100 text-muted',
  dark:   'bg-dark text-white',
}

export default function Badge({ children, colour = 'purple', className = '' }) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        colours[colour],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
