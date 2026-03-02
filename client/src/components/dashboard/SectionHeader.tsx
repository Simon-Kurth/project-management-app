interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-base font-bold text-[#141A2B] tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs text-[#6E7791] mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
