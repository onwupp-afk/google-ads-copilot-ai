import { useMemo } from "react";
import { Navigation } from "@shopify/polaris";
import type { NavigationProps } from "@shopify/polaris";
import {
  ChartHistogramGrowthIcon,
  ClipboardChecklistIcon,
  GlobeIcon,
  HomeIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";

type SidebarNavProps = {
  activePath: string;
  persistentSearch: string | null;
  onNavigate?: () => void;
};

export function SidebarNav({
  activePath,
  persistentSearch,
  onNavigate,
}: SidebarNavProps) {
  const query = useMemo(
    () => (persistentSearch && persistentSearch.length > 0 ? `?${persistentSearch}` : ""),
    [persistentSearch],
  );

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
            icon: ChartHistogramGrowthIcon,
            url: `/app/scans${query}`,
            onClick: onNavigate,
          },
          {
            label: "Audit Trail",
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
