import { Link } from "@shopify/polaris";
import { NavLink } from "@remix-run/react";

export default function SidebarNav() {
  const items = [
    { to: "/app", label: "Home" },
    { to: "/app/scans", label: "Scans" },
    { to: "/app/audits", label: "Audits" },
    { to: "/app/settings", label: "Settings" },
  ];

  return (
    <nav>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li key={item.to} style={{ marginBottom: 8 }}>
            <NavLink to={item.to} prefetch="intent" style={{ textDecoration: "none" }}>
              {({ isActive }) => (
                <Link removeUnderline monochrome url={item.to}>
                  {isActive ? `• ${item.label}` : item.label}
                </Link>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
