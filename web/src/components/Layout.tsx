import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", icon: "📊", label: "Dashboard" },
  { to: "/hosts", icon: "🌐", label: "Proxy Hosts" },
  { to: "/default-route", icon: "🔀", label: "Default Route" },
  { to: "/certificates", icon: "🔐", label: "Certificates" },
  { to: "/monitoring", icon: "📈", label: "Monitoring" },
];

const pipelineItems = [
  { to: "/pipeline/auth", icon: "🔑", label: "Authentication", disabled: true },
  { to: "/pipeline/waf", icon: "🛡️", label: "WAF", disabled: true },
  { to: "/pipeline/acl", icon: "📋", label: "ACL / Filter", disabled: true },
];

const bottomItems = [{ to: "/settings", icon: "⚙️", label: "Settings" }];

export function Layout() {
  return (
    <div className="flex min-h-screen bg-nubi-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-700 bg-slate-900">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-700 px-6">
          <img src="/logo.svg" alt="Nubi" className="h-8 w-auto invert" />
          <div>
            <span className="text-xl font-bold text-nubi-accent">Nubi</span>
            <span className="ml-1 text-xs text-slate-500">Control Panel</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-4">
          {/* Main Menu */}
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-nubi-accent/20 text-nubi-accent"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                    }`
                  }
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Pipeline Section */}
          <div className="mt-6 border-t border-slate-700 pt-4">
            <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pipeline
            </p>
            <ul className="space-y-1">
              {pipelineItems.map((item) => (
                <li key={item.to}>
                  <span
                    className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-slate-500"
                    title="Coming soon"
                  >
                    <span className="text-lg opacity-50">{item.icon}</span>
                    <span className="opacity-50">{item.label}</span>
                    <span className="ml-auto rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                      Soon
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Settings */}
          <div className="mt-6 border-t border-slate-700 pt-4">
            <ul className="space-y-2">
              {bottomItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
                        isActive
                          ? "bg-nubi-accent/20 text-nubi-accent"
                          : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                      }`
                    }
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            Nginx Running
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
