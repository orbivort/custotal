import { NavLink } from 'react-router';

const adminTabs = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/stages', label: 'Pipeline stages' },
  { to: '/admin/import', label: 'CSV import' },
  { to: '/admin/recover', label: 'Recovery' },
];

export function AdminNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b hairline" aria-label="Admin sections">
      {adminTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'border-forest font-medium text-forest'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
