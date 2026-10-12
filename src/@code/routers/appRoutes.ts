import { AuthorRole } from "@shared/enums";
import { ADMIN_ROLES } from "@shared/utils";
import type { AppRoute } from "@shared/types";

export const APP_ROUTES: AppRoute[] = [
  {
    path: "/",
    label: "Home",
    icon: "🏠",
    description: "Browse the game catalog and launch a game.",
  },
  {
    path: "/feed",
    label: "Feed",
    icon: "📰",
    description: "See announcements, achievements, and statuses from everyone.",
  },
  {
    path: "/missions",
    label: "Missions",
    icon: "🎯",
    description: "View your play streak and available missions.",
  },
  {
    path: "/profile",
    label: "Profile",
    icon: "🧑\u200d🌾",
    description: "Manage your player profile.",
  },
  {
    path: "/wallet/top-up",
    label: "Buy Coins",
    icon: "🪙",
    description: "Try sandbox-only coin packages through PayMongo test checkout.",
  },
  {
    path: "/wallet/share",
    label: "Share Coins",
    icon: "🎁",
    description: "Send coins to another player.",
    restrictedToRoles: [AuthorRole.Player],
  },
  {
    path: "/admin/users",
    label: "Manage Users",
    icon: "🛠️",
    description: "SuperAdmin: manage all users and adjust coins.",
    restrictedToRoles: ADMIN_ROLES,
  },
  {
    path: "/admin/coin-history",
    label: "Coin History",
    icon: "📜",
    description: "View your coin history or review all player coin adjustments.",
  },
  {
    path: "/admin/missions",
    label: "Missions Manager",
    icon: "🎯",
    description: "SuperAdmin: set bonus coins for player missions.",
    restrictedToRoles: ADMIN_ROLES,
  },
  {
    path: "/admin/games/register",
    label: "Register Game App",
    icon: "🔌",
    description: "SuperAdmin: register a provider and its transaction contract.",
    restrictedToRoles: [AuthorRole.SuperAdmin],
  },
];

