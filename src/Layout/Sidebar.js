// src/Layout/Sidebar.jsx
import React, { useMemo, useState } from "react";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  useTheme,
  Divider,
  Tooltip,
  Badge,
  IconButton,
  ListSubheader,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  PersonAdd as PersonAddIcon,
  People as PeopleIcon,
  CalendarToday as CalendarTodayIcon,
  Repeat as RepeatIcon,
  BarChart as BarChartIcon,
  Person as PersonIcon,
  Assessment as AssessmentIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { motion } from "framer-motion";

// ✅ New: your logo asset
import firmLogo from "../assets/logo.png";

const DRAWER_W = 240;
const COLLAPSED_W = 64;
const LS_KEY = "sidebar_open_v1";

// 🎨 Executive Cool Palette
const FEDERAL_BLUE = "#0b3a75";
const PERSIAN_GREEN = "#00a693";
const SYRACUSE_RED = "#d44500";

// Framer Motion variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: "beforeChildren", staggerChildren: 0.03 },
  },
};
const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
};

export default function Sidebar({
  open: openProp,
  onToggle,
  badges = { promised: 0, followUps: 0 },
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { loading, isEditorOrHigher, canManageUsers } = useAuth();

  // Persistent open state
  const [internalOpen, setInternalOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored ? stored === "1" : true;
    } catch {
      return true;
    }
  });
  const open = openProp ?? internalOpen;
  const setOpen = (v) => {
    if (onToggle) return onToggle();
    setInternalOpen(v);
    try {
      localStorage.setItem(LS_KEY, v ? "1" : "0");
    } catch {}
  };
  const toggle = () => setOpen(!open);

  // Sections
  const commonItems = [
    { text: "Dashboard", icon: <BarChartIcon />, to: "/dashboard" },
    { text: "View Clients", icon: <PeopleIcon />, to: "/clients" },
    { text: "Reports", icon: <AssessmentIcon />, to: "/reports" },
  ];
  const editorItems = [
    { text: "Create Client", icon: <PersonAddIcon />, to: "/create-client" },
    {
      text: "Promised Payments",
      icon: <CalendarTodayIcon />,
      to: "/promised-payments",
      badge: badges.promised || 0,
    },
    {
      text: "Follow Ups",
      icon: <RepeatIcon />,
      to: "/follow-ups",
      badge: badges.followUps || 0,
    },
  ];
  const adminItems = [{ text: "Register User", icon: <PersonIcon />, to: "/register" }];

  const sections = useMemo(() => {
    const s = [{ title: null, items: commonItems }];
    if (isEditorOrHigher()) s.push({ title: "Operations", items: editorItems });
    if (canManageUsers()) s.push({ title: "Admin", items: adminItems });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditorOrHigher, canManageUsers, badges.promised, badges.followUps]);

  if (loading) return null;

  // 🎨 Executive Cool gradient & colors
  const gradientBg = isDark
    ? `linear-gradient(180deg, ${FEDERAL_BLUE} 0%, ${PERSIAN_GREEN} 100%)`
    : `linear-gradient(180deg, ${FEDERAL_BLUE} 0%, ${PERSIAN_GREEN} 100%)`;

  const textColor = isDark ? "rgba(240,245,255,0.95)" : "#ffffff";
  const subText = isDark ? "rgba(220,230,255,0.75)" : "rgba(255,255,255,0.8)";
  const dividerColor = isDark
    ? "rgba(255,255,255,0.16)"
    : "rgba(255,255,255,0.25)";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)";
  const activeBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.10)";
  const accent = SYRACUSE_RED; // 🟠 Active accent (warm contrast)
  const accentGlow = `0 0 12px ${alpha(accent, 0.5)}`;

  // ✅ Shared logo filter to make it pop
  const logoFilter = "brightness(1.15) drop-shadow(0 0 8px rgba(255,255,255,0.65))";

  return (
    <Drawer
      variant="persistent"
      open={open}
      PaperProps={{
        sx: {
          width: open ? DRAWER_W : COLLAPSED_W,
          boxSizing: "border-box",
          backgroundImage: gradientBg,
          color: textColor,
          borderRight: "1px solid rgba(255,255,255,0.1)",
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.easeInOut,
            duration: theme.transitions.duration.enteringScreen,
          }),
          overflowX: "hidden",
        },
        component: motion.div,
        variants: containerVariants,
        initial: "hidden",
        animate: "visible",
      }}
      sx={{ width: open ? DRAWER_W : COLLAPSED_W, flexShrink: 0 }}
    >
      {/* Header / Logo */}
      <Box
        component={Link}
        to="/dashboard"
        display="flex"
        alignItems="center"
        justifyContent="center"
        sx={{
          height: 132,
          textDecoration: "none",
          color: "inherit",
          px: 1,
        }}
      >
        {open ? (
          <motion.div
            variants={itemVariants}
            style={{ width: "100%", textAlign: "center" }}
          >
            <img
              src={firmLogo}
              alt="Firm Logo"
              style={{
                height: 56,
                marginBottom: 8,
                objectFit: "contain",
                filter: logoFilter, // ✅ brighter + glow
              }}
            />
            {/* 🔕 Firm name text removed as requested */}
          </motion.div>
        ) : (
          <motion.div
            variants={itemVariants}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <img
              src={firmLogo}
              alt="Firm"
              style={{
                height: 28,
                objectFit: "contain",
                filter: logoFilter, // ✅ keep the pop even when collapsed
              }}
            />
          </motion.div>
        )}
      </Box>

      <Divider sx={{ opacity: 1, borderColor: dividerColor }} />

      {/* Menu */}
      <List disablePadding sx={{ py: 0.5 }}>
        {sections.map((section, sIdx) => (
          <Box key={sIdx} sx={{ mb: 0.5 }}>
            {section.title && open && (
              <ListSubheader
                disableSticky
                component={motion.div}
                variants={itemVariants}
                sx={{
                  bgcolor: "transparent",
                  color: subText,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.7,
                }}
              >
                {section.title.toUpperCase()}
              </ListSubheader>
            )}

            {section.items.map(({ text, icon, to, badge }) => {
              const button = (
                <ListItemButton
                  component={NavLink}
                  to={to}
                  end
                  sx={{
                    px: 2,
                    minHeight: 46,
                    justifyContent: open ? "initial" : "center",
                    borderLeft: "4px solid transparent",
                    "&.active": {
                      background: activeBg,
                      borderLeft: `4px solid ${accent}`,
                      boxShadow: accentGlow,
                      "& .MuiListItemIcon-root": { color: accent },
                      "& .MuiListItemText-primary": { fontWeight: 700, color: "#fff" },
                    },
                    "&:hover": { background: hoverBg },
                    transition: "all 180ms ease",
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: textColor,
                      minWidth: 0,
                      mr: open ? 2 : "auto",
                      justifyContent: "center",
                    }}
                  >
                    {badge ? (
                      <Badge color="error" badgeContent={badge} overlap="circular">
                        {icon}
                      </Badge>
                    ) : (
                      icon
                    )}
                  </ListItemIcon>

                  {open && (
                    <ListItemText
                      primary={text}
                      primaryTypographyProps={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: textColor,
                      }}
                    />
                  )}
                </ListItemButton>
              );

              return (
                <ListItem
                  key={to}
                  disablePadding
                  sx={{ mb: 0.25 }}
                  component={motion.div}
                  variants={itemVariants}
                >
                  {open ? (
                    button
                  ) : (
                    <Tooltip title={text} placement="right">
                      <Box sx={{ width: "100%" }}>{button}</Box>
                    </Tooltip>
                  )}
                </ListItem>
              );
            })}
          </Box>
        ))}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      {/* Collapse/Expand control */}
      <Box
        sx={{
          p: 1,
          display: "flex",
          justifyContent: open ? "flex-end" : "center",
        }}
        component={motion.div}
        variants={itemVariants}
      >
        <IconButton
          onClick={toggle}
          size="small"
          sx={{
            color: textColor,
            bgcolor: alpha("#ffffff", 0.1),
            "&:hover": { bgcolor: alpha("#ffffff", 0.18) },
          }}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          <motion.div
            animate={{ rotate: open ? 0 : 180 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </motion.div>
        </IconButton>
      </Box>
    </Drawer>
  );
}