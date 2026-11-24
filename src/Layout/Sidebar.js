// src/Layout/Sidebar.js
// Main navigation, grouped by what people come to do:
//   Home / Clients · Work (billing team) · Insights · Team (leads) · Admin
// Work items show live counts of what is waiting (from WorkQueueProvider).
import React from "react";
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Tooltip, IconButton, Typography, Badge } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SpaceDashboardRounded from "@mui/icons-material/SpaceDashboardRounded";
import PeopleAltRounded from "@mui/icons-material/PeopleAltRounded";
import PhoneInTalkRounded from "@mui/icons-material/PhoneInTalkRounded";
import EventAvailableRounded from "@mui/icons-material/EventAvailableRounded";
import AccountBalanceWalletRounded from "@mui/icons-material/AccountBalanceWalletRounded";
import PlaylistAddCheckRounded from "@mui/icons-material/PlaylistAddCheckRounded";
import RuleRounded from "@mui/icons-material/RuleRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import ManageAccountsRounded from "@mui/icons-material/ManageAccountsRounded";
import PersonAddAlt1Rounded from "@mui/icons-material/PersonAddAlt1Rounded";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { FEATURES } from "../config/features";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { BRAND } from "../theme/brand";
import { ReactComponent as LogoMono } from "../assets/rahman-law-logo-mono.svg";

export const DRAWER_W = 248;
export const COLLAPSED_W = 68;

function useSections() {
  const { isEditorOrHigher, isLeadOrHigher, canManageUsers } = useAuth();
  const { counts } = useWorkQueue();
  const s = [
    {
      title: null,
      items: [
        { text: "Home", icon: <SpaceDashboardRounded />, to: "/dashboard", hint: "Today at a glance and what needs attention" },
        { text: "Clients", icon: <PeopleAltRounded />, to: "/clients", match: ["/clients", "/client/"], hint: "Search clients and open their profile" },
      ],
    },
  ];
  if (isEditorOrHigher()) {
    s.push({
      title: "Work",
      items: [
        { text: "Follow-ups", icon: <PhoneInTalkRounded />, to: "/follow-ups", badge: counts.followUpsOpen, hint: "Clients who missed this month's payment" },
        { text: "Promised payments", icon: <EventAvailableRounded />, to: "/promised-payments", badge: counts.promisesToday, hint: "Promises due today and coming up" },
        { text: "Initial payments", icon: <AccountBalanceWalletRounded />, to: "/initial-payments", badge: counts.initialOpen, hint: "Initial payments not paid in full in MyCase" },
        { text: "Case Setup", icon: <PlaylistAddCheckRounded />, to: "/case-setup", badge: counts.caseSetupTotal, hint: "New MyCase cases, plans to set and links to fix" },
        { text: "MyCase Review", icon: <RuleRounded />, to: "/mycase-review", badge: counts.reviewOpen, hint: "MyCase payments the sync could not place on its own" },
        ...(FEATURES.createClient ? [{ text: "Create client", icon: <PersonAddAlt1Rounded />, to: "/create-client" }] : []),
      ],
    });
  }
  s.push({
    title: "Insights",
    items: [
      { text: "Reports", icon: <InsightsRounded />, to: "/reports", hint: "Past due, collections, payments, MyCase" },
    ],
  });
  if (isLeadOrHigher()) {
    s.push({ title: "Team", items: [{ text: "Team performance", icon: <GroupsRounded />, to: "/team", hint: "How each team member is doing" }] });
  }
  if (canManageUsers()) {
    s.push({ title: "Admin", items: [{ text: "Users & roles", icon: <ManageAccountsRounded />, to: "/admin/users", match: ["/admin", "/register"], hint: "Add people and set what they can do" }] });
  }
  return s;
}

export default function Sidebar({ open, onToggle }) {
  const sections = useSections();
  const location = useLocation();
  const width = open ? DRAWER_W : COLLAPSED_W;
  const isActive = (item) => (item.match || [item.to]).some((p) => location.pathname === p || location.pathname.startsWith(p.endsWith("/") ? p : `${p}/`));

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: "width .2s ease",
        "& .MuiDrawer-paper": {
          width,
          overflowX: "hidden",
          transition: "width .2s ease",
          border: 0,
          color: "#fff",
          background: `linear-gradient(180deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* Logo */}
      <Box component={Link} to="/dashboard" aria-label="Home" sx={{ display: "flex", alignItems: "center", justifyContent: open ? "flex-start" : "center", px: open ? 2.5 : 0, py: 2.25, color: "#fff", textDecoration: "none" }}>
        {open ? (
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            <LogoMono style={{ height: 38, width: "auto", color: "#fff" }} aria-hidden="true" />
            <Typography sx={{ mt: 0.75, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: alpha("#fff", 0.7) }}>
              Collections
            </Typography>
          </Box>
        ) : (
          <LogoMono viewBox="0 0 58 56" style={{ height: 34, width: 36, color: "#fff" }} aria-hidden="true" />
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", pb: 1 }}>
        {sections.map((sec, i) => (
          <Box key={sec.title || i} sx={{ mt: i ? 1.5 : 0.5 }}>
            {sec.title &&
              (open ? (
                <Typography sx={{ px: 2.75, pb: 0.5, fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: alpha("#fff", 0.55) }}>
                  {sec.title}
                </Typography>
              ) : (
                <Box sx={{ mx: 2, mb: 1, borderTop: `1px solid ${alpha("#fff", 0.15)}` }} />
              ))}
            <List dense disablePadding>
              {sec.items.map((item) => {
                const active = isActive(item);
                const badge = Number(item.badge || 0);
                const btn = (
                  <ListItemButton
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    sx={{
                      mx: 1.25,
                      my: 0.25,
                      minHeight: 42,
                      borderRadius: 2,
                      px: open ? 1.5 : 0,
                      justifyContent: open ? "flex-start" : "center",
                      color: active ? "#fff" : alpha("#fff", 0.82),
                      bgcolor: active ? alpha("#fff", 0.14) : "transparent",
                      position: "relative",
                      "&::before": active
                        ? { content: '""', position: "absolute", left: -10, top: 8, bottom: 8, width: 4, borderRadius: 4, bgcolor: BRAND.orange }
                        : {},
                      "&:hover": { bgcolor: alpha("#fff", active ? 0.18 : 0.08), color: "#fff" },
                      "&.Mui-focusVisible": { outline: `2px solid ${alpha("#fff", 0.7)}` },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: open ? 38 : 0, color: "inherit", justifyContent: "center" }}>
                      {open ? item.icon : <Badge color="secondary" variant="dot" invisible={!badge}>{item.icon}</Badge>}
                    </ListItemIcon>
                    {open && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: active ? 800 : 600, fontSize: 14.5, noWrap: true }} />}
                    {open && badge > 0 && (
                      <Box component="span" sx={{ ml: 1, minWidth: 24, height: 20, px: 0.75, borderRadius: 10, bgcolor: BRAND.orange, color: "#fff", fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        {badge > 999 ? "999+" : badge}
                      </Box>
                    )}
                  </ListItemButton>
                );
                return open ? (
                  <Tooltip key={item.to} title={item.hint || ""} placement="right" enterDelay={700} disableHoverListener={!item.hint}>
                    {btn}
                  </Tooltip>
                ) : (
                  <Tooltip key={item.to} title={badge ? `${item.text} (${badge})` : item.text} placement="right">
                    {btn}
                  </Tooltip>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Box sx={{ p: 1, display: "flex", justifyContent: open ? "flex-end" : "center", borderTop: `1px solid ${alpha("#fff", 0.12)}` }}>
        <Tooltip title={open ? "Collapse menu" : "Expand menu"} placement="right">
          <IconButton onClick={onToggle} size="small" sx={{ color: alpha("#fff", 0.8) }} aria-label={open ? "Collapse menu" : "Expand menu"}>
            {open ? <ChevronLeftRounded /> : <ChevronRightRounded />}
          </IconButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
}
