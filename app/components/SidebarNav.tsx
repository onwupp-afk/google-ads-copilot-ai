import { useMemo } from "react";
import { Navigation } from "@shopify/polaris";
import type { NavigationProps } from "@shopify/polaris";
import {
  ChartLineIcon,
  ClipboardChecklistIcon,
  CompassIcon,
  GlobeIcon,
  HomeIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";

type SidebarNavProps = {
  activePath: string;
  host: string;
  shop: string;
  onNavigate?: () => void;
};

export function SidebarNav({
  activePath,
  host,
  shop,
  onNavigate,
}: SidebarNavProps) {
  const query = useMemo(() => {
    const params = new URLSearchParams({
      host,
      shop,
    });
    return `?${params.toString()}`;
  }, [host, shop]);

  const sections: NavigationProps["sections"] = useMemo(
    () => [
      {
        items: [
          {
            label: "Dashboard",
            icon: HomeIcon,
            url: `/app${query}`,
            exactMatch: true,
            onClick: onNavigate,
          },
          {
            label: "Markets",
            icon: GlobeIcon,
            url: `/app/markets${query}`,
            onClick: onNavigate,
          },
          {
            label: "Scans",
            icon: ChartLineIcon,
            url: `/app/scans${query}`,
            onClick: onNavigate,
          },
          {
            label: "Audits",
            icon: ClipboardChecklistIcon,
            url: `/app/audits${query}`,
            onClick: onNavigate,
          },
          {
            label: "Settings",
            icon: SettingsIcon,
            url: `/app/settings${query}`,
            onClick: onNavigate,
          },
        ],
      },
    ],
    [onNavigate, query],
  );

  return <Navigation location={activePath} sections={sections} />;
}

export default SidebarNav;
