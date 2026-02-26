export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="py-16 px-4 text-center flex flex-col items-center">
      {Icon && (
        <div className="h-14 w-14 rounded-full bg-brand-lavender-light flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-brand-purple" />
        </div>
      )}
      <p className="text-base font-semibold text-dark mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted mb-5 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  )
}
