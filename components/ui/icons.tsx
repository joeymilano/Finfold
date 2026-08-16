"use client";

import React, { forwardRef } from "react";
import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";
import type { FontAwesomeSnapshotDefinition } from "./fontawesome-icon-types";
import { lucideFallbacks } from "./lucide-fallbacks";
import {
  faArrowRightFromBracket,
  faArrowRightToBracket,
  faArrowRotateLeft,
  faArrowTrendUp,
  faAt,
  faBan,
  faBarcodeScan,
  faBookOpen,
  faBookmark,
  faBracketsCurly,
  faBriefcase,
  faBug,
  faBuilding,
  faCalendarDays,
  faCamera,
  faChartColumn,
  faCheck,
  faCircle,
  faCircleCheck,
  faCircleDashed,
  faCircleDot,
  faCircleExclamation,
  faCirclePlus,
  faCircleQuestion,
  faCircleUser,
  faCircleXmark,
  faClipboard,
  faClipboardList,
  faClock,
  faCode,
  faCoffee,
  faCoins,
  faComment,
  faCompass,
  faCopy,
  faCreditCard,
  faDatabase,
  faDownload,
  faEnvelope,
  faExpand,
  faEye,
  faFileCode,
  faFileSpreadsheet,
  faFileText,
  faFiles,
  faFilm,
  faFlame,
  faFlask,
  faGauge,
  faGaugeHigh,
  faGear,
  faGlobe,
  faHashtag,
  faHeart,
  faHistory,
  faHome,
  faImage,
  faImageCirclePlus,
  faImages,
  faInfo,
  faKey,
  faLanguage,
  faLayerGroup,
  faLightbulb,
  faLink,
  faLock,
  faLockKeyhole,
  faMapPin,
  faMessage,
  faMessageExclamation,
  faMicrophone,
  faMobileScreenButton,
  faMoon,
  faPalette,
  faPaperclip,
  faPaste,
  faPenLine,
  faPencil,
  faPlugCircleBolt,
  faQuoteLeft,
  faRadar,
  faRadio,
  faReceipt,
  faRepeat,
  faRotateLeft,
  faRotateRight,
  faSave,
  faSearch,
  faSend,
  faShareNodes,
  faShield,
  faShieldExclamation,
  faSidebar,
  faSliders,
  faSpinnerThird,
  faSquare,
  faStar,
  faStore,
  faSun,
  faTableLayout,
  faThumbsDown,
  faThumbsUp,
  faTicket,
  faTowerBroadcast,
  faTrashCan,
  faTriangleExclamation,
  faUnlink,
  faUpload,
  faUser,
  faUserPlus,
  faUsers,
  faWrench
} from "./fontawesome-pro-snapshot";
import {
  faLightArrowDown,
  faLightArrowDownRight,
  faLightArrowLeft,
  faLightArrowRight,
  faLightArrowUp,
  faLightArrowUpRight,
  faLightBars,
  faLightChevronDown,
  faLightChevronRight,
  faLightChevronUp,
  faLightDownLong,
  faLightEllipsis,
  faLightExternalLink,
  faLightMinus,
  faLightPlus,
  faLightUpLong,
  faLightX
} from "./fontawesome-pro-snapshot";
import {
  faSignatureAward,
  faSignatureBadgeCheck,
  faSignatureBrain,
  faSignatureBrainCircuit,
  faSignatureBullseye,
  faSignatureDatabase,
  faSignatureFishFins,
  faSignatureGift,
  faSignatureRocket,
  faSignatureShieldCheck,
  faSignatureSparkles,
  faSignatureWandMagic,
  faSignatureWandSparkles,
  faSignatureWavePulse,
  faSignatureZap
} from "./fontawesome-pro-snapshot";
import {
  faFacebookF,
  faInstagram
} from "./fontawesome-pro-snapshot";

export type FinfoldIconTone = "regular" | "light" | "signature" | "brand";
export type FinfoldIconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children"> & {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};
export type LucideProps = FinfoldIconProps;
export type LucideIcon = ForwardRefExoticComponent<FinfoldIconProps & RefAttributes<SVGSVGElement>>;

export type FinfoldIconProvider = "fontawesome" | "lucide";

function hasUsableFontAwesomeData(icon: FontAwesomeSnapshotDefinition): boolean {
  const [width, height, , , pathData] = icon.icon;
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  return width > 0 && height > 0 && paths.some((path) => typeof path === "string" && path.length > 0);
}

export function resolveFinfoldIconProvider(icon: FontAwesomeSnapshotDefinition): FinfoldIconProvider {
  if (process.env.NEXT_PUBLIC_FINFOLD_ICON_PROVIDER === "lucide") return "lucide";
  return hasUsableFontAwesomeData(icon) ? "fontawesome" : "lucide";
}

function createFinfoldIcon(
  name: keyof typeof lucideFallbacks,
  icon: FontAwesomeSnapshotDefinition,
  tone: FinfoldIconTone
): LucideIcon {
  const Component = forwardRef<SVGSVGElement, FinfoldIconProps>(function FinfoldIcon(
    { size, strokeWidth, absoluteStrokeWidth, style, ...props },
    ref
  ) {
    const dimension = size == null ? undefined : typeof size === "number" ? size + "px" : size;
    const className = [
      "fin-icon",
      tone === "signature" ? "fin-icon--signature" : "",
      props.className
    ].filter(Boolean).join(" ");
    const isDecorative = props["aria-label"] == null;

    if (resolveFinfoldIconProvider(icon) === "lucide") {
      const LucideFallback = lucideFallbacks[name];
      return (
        <LucideFallback
          {...props}
          ref={ref}
          role={props.role ?? (isDecorative ? undefined : "img")}
          aria-hidden={props["aria-hidden"] ?? (isDecorative ? true : undefined)}
          size={size}
          strokeWidth={strokeWidth}
          absoluteStrokeWidth={absoluteStrokeWidth}
          data-fin-icon={name}
          data-fin-icon-tone={tone}
          data-fin-icon-provider="lucide"
          className={className}
          style={style}
        />
      );
    }

    const [width, height, , , pathData] = icon.icon;
    const paths = Array.isArray(pathData) ? pathData : [pathData];

    return (
      <svg
        {...props}
        ref={ref}
        role={props.role ?? (isDecorative ? undefined : "img")}
        aria-hidden={props["aria-hidden"] ?? (isDecorative ? true : undefined)}
        viewBox={`0 0 ${width} ${height}`}
        data-prefix={icon.prefix}
        data-icon={icon.iconName}
        data-fin-icon={name}
        data-fin-icon-tone={tone}
        data-fin-icon-provider="fontawesome"
        className={["svg-inline--fa", `fa-${icon.iconName}`, className].join(" ")}
        style={{ ...(dimension ? { width: dimension, height: dimension } : {}), ...style }}
      >
        {paths.length > 1 ? (
          <g className="fa-duotone-group">
            <path className="fa-secondary" fill="currentColor" d={paths[0]} />
            <path className="fa-primary" fill="currentColor" d={paths[1]} />
          </g>
        ) : (
          <path fill="currentColor" d={paths[0]} />
        )}
      </svg>
    );
  });
  Component.displayName = name;
  return Component;
}

export const Activity = createFinfoldIcon("Activity", faSignatureWavePulse, "signature");
export const AlertCircle = createFinfoldIcon("AlertCircle", faCircleExclamation, "regular");
export const AlertTriangle = createFinfoldIcon("AlertTriangle", faTriangleExclamation, "regular");
export const ArrowBigDown = createFinfoldIcon("ArrowBigDown", faLightDownLong, "light");
export const ArrowBigUp = createFinfoldIcon("ArrowBigUp", faLightUpLong, "light");
export const ArrowDown = createFinfoldIcon("ArrowDown", faLightArrowDown, "light");
export const ArrowDownRight = createFinfoldIcon("ArrowDownRight", faLightArrowDownRight, "light");
export const ArrowLeft = createFinfoldIcon("ArrowLeft", faLightArrowLeft, "light");
export const ArrowRight = createFinfoldIcon("ArrowRight", faLightArrowRight, "light");
export const ArrowUp = createFinfoldIcon("ArrowUp", faLightArrowUp, "light");
export const ArrowUpRight = createFinfoldIcon("ArrowUpRight", faLightArrowUpRight, "light");
export const AtSign = createFinfoldIcon("AtSign", faAt, "regular");
export const Award = createFinfoldIcon("Award", faSignatureAward, "signature");
export const BadgeCheck = createFinfoldIcon("BadgeCheck", faSignatureBadgeCheck, "signature");
export const Ban = createFinfoldIcon("Ban", faBan, "regular");
export const BarChart3 = createFinfoldIcon("BarChart3", faChartColumn, "regular");
export const BookOpenText = createFinfoldIcon("BookOpenText", faBookOpen, "regular");
export const Bookmark = createFinfoldIcon("Bookmark", faBookmark, "regular");
export const Bot = createFinfoldIcon("Bot", faSignatureFishFins, "signature");
export const Braces = createFinfoldIcon("Braces", faBracketsCurly, "regular");
export const Brain = createFinfoldIcon("Brain", faSignatureBrain, "signature");
export const BrainCircuit = createFinfoldIcon("BrainCircuit", faSignatureBrainCircuit, "signature");
export const BriefcaseBusiness = createFinfoldIcon("BriefcaseBusiness", faBriefcase, "regular");
export const Bug = createFinfoldIcon("Bug", faBug, "regular");
export const Building2 = createFinfoldIcon("Building2", faBuilding, "regular");
export const CalendarDays = createFinfoldIcon("CalendarDays", faCalendarDays, "regular");
export const Camera = createFinfoldIcon("Camera", faCamera, "regular");
export const Check = createFinfoldIcon("Check", faCheck, "regular");
export const CheckCircle2 = createFinfoldIcon("CheckCircle2", faCircleCheck, "regular");
export const ChevronDown = createFinfoldIcon("ChevronDown", faLightChevronDown, "light");
export const ChevronRight = createFinfoldIcon("ChevronRight", faLightChevronRight, "light");
export const ChevronUp = createFinfoldIcon("ChevronUp", faLightChevronUp, "light");
export const Circle = createFinfoldIcon("Circle", faCircle, "regular");
export const CircleAlert = createFinfoldIcon("CircleAlert", faCircleExclamation, "regular");
export const CircleDot = createFinfoldIcon("CircleDot", faCircleDot, "regular");
export const CircleDotDashed = createFinfoldIcon("CircleDotDashed", faCircleDashed, "regular");
export const CircleGauge = createFinfoldIcon("CircleGauge", faGaugeHigh, "regular");
export const CircleHelp = createFinfoldIcon("CircleHelp", faCircleQuestion, "regular");
export const CirclePlus = createFinfoldIcon("CirclePlus", faCirclePlus, "regular");
export const Clipboard = createFinfoldIcon("Clipboard", faClipboard, "regular");
export const ClipboardList = createFinfoldIcon("ClipboardList", faClipboardList, "regular");
export const ClipboardPaste = createFinfoldIcon("ClipboardPaste", faPaste, "regular");
export const Clock = createFinfoldIcon("Clock", faClock, "regular");
export const Clock3 = createFinfoldIcon("Clock3", faClock, "regular");
export const Code = createFinfoldIcon("Code", faCode, "regular");
export const Coffee = createFinfoldIcon("Coffee", faCoffee, "regular");
export const Coins = createFinfoldIcon("Coins", faCoins, "regular");
export const Compass = createFinfoldIcon("Compass", faCompass, "regular");
export const Copy = createFinfoldIcon("Copy", faCopy, "regular");
export const CreditCard = createFinfoldIcon("CreditCard", faCreditCard, "regular");
export const Database = createFinfoldIcon("Database", faDatabase, "regular");
export const DatabaseZap = createFinfoldIcon("DatabaseZap", faSignatureDatabase, "signature");
export const Download = createFinfoldIcon("Download", faDownload, "regular");
export const Expand = createFinfoldIcon("Expand", faExpand, "regular");
export const ExternalLink = createFinfoldIcon("ExternalLink", faLightExternalLink, "light");
export const Eye = createFinfoldIcon("Eye", faEye, "regular");
export const Facebook = createFinfoldIcon("Facebook", faFacebookF, "brand");
export const FileCode2 = createFinfoldIcon("FileCode2", faFileCode, "regular");
export const FileJson = createFinfoldIcon("FileJson", faFileCode, "regular");
export const FileSpreadsheet = createFinfoldIcon("FileSpreadsheet", faFileSpreadsheet, "regular");
export const FileStack = createFinfoldIcon("FileStack", faFiles, "regular");
export const FileText = createFinfoldIcon("FileText", faFileText, "regular");
export const Film = createFinfoldIcon("Film", faFilm, "regular");
export const Flame = createFinfoldIcon("Flame", faFlame, "regular");
export const FlaskConical = createFinfoldIcon("FlaskConical", faFlask, "regular");
export const Gauge = createFinfoldIcon("Gauge", faGauge, "regular");
export const Gift = createFinfoldIcon("Gift", faSignatureGift, "signature");
export const Globe = createFinfoldIcon("Globe", faGlobe, "regular");
export const Globe2 = createFinfoldIcon("Globe2", faGlobe, "regular");
export const Hash = createFinfoldIcon("Hash", faHashtag, "regular");
export const Heart = createFinfoldIcon("Heart", faHeart, "regular");
export const History = createFinfoldIcon("History", faHistory, "regular");
export const Home = createFinfoldIcon("Home", faHome, "regular");
export const Image = createFinfoldIcon("Image", faImage, "regular");
export const ImageIcon = createFinfoldIcon("ImageIcon", faImage, "regular");
export const ImagePlus = createFinfoldIcon("ImagePlus", faImageCirclePlus, "regular");
export const Images = createFinfoldIcon("Images", faImages, "regular");
export const Info = createFinfoldIcon("Info", faInfo, "regular");
export const Instagram = createFinfoldIcon("Instagram", faInstagram, "brand");
export const KeyRound = createFinfoldIcon("KeyRound", faKey, "regular");
export const Languages = createFinfoldIcon("Languages", faLanguage, "regular");
export const Layers = createFinfoldIcon("Layers", faLayerGroup, "regular");
export const Layers3 = createFinfoldIcon("Layers3", faLayerGroup, "regular");
export const LayoutTemplate = createFinfoldIcon("LayoutTemplate", faTableLayout, "regular");
export const Lightbulb = createFinfoldIcon("Lightbulb", faLightbulb, "regular");
export const Link2 = createFinfoldIcon("Link2", faLink, "regular");
export const Loader2 = createFinfoldIcon("Loader2", faSpinnerThird, "regular");
export const Lock = createFinfoldIcon("Lock", faLock, "regular");
export const LockKeyhole = createFinfoldIcon("LockKeyhole", faLockKeyhole, "regular");
export const LogIn = createFinfoldIcon("LogIn", faArrowRightToBracket, "regular");
export const LogOut = createFinfoldIcon("LogOut", faArrowRightFromBracket, "regular");
export const Mail = createFinfoldIcon("Mail", faEnvelope, "regular");
export const MapPin = createFinfoldIcon("MapPin", faMapPin, "regular");
export const Menu = createFinfoldIcon("Menu", faLightBars, "light");
export const MessageCircle = createFinfoldIcon("MessageCircle", faComment, "regular");
export const MessageSquare = createFinfoldIcon("MessageSquare", faMessage, "regular");
export const MessageSquareWarning = createFinfoldIcon("MessageSquareWarning", faMessageExclamation, "regular");
export const Mic = createFinfoldIcon("Mic", faMicrophone, "regular");
export const Minus = createFinfoldIcon("Minus", faLightMinus, "light");
export const Moon = createFinfoldIcon("Moon", faMoon, "regular");
export const MoreHorizontal = createFinfoldIcon("MoreHorizontal", faLightEllipsis, "light");
export const Palette = createFinfoldIcon("Palette", faPalette, "regular");
export const PanelRight = createFinfoldIcon("PanelRight", faSidebar, "regular");
export const Paperclip = createFinfoldIcon("Paperclip", faPaperclip, "regular");
export const PenLine = createFinfoldIcon("PenLine", faPenLine, "regular");
export const Pencil = createFinfoldIcon("Pencil", faPencil, "regular");
export const PlugZap = createFinfoldIcon("PlugZap", faPlugCircleBolt, "regular");
export const Plus = createFinfoldIcon("Plus", faLightPlus, "light");
export const Quote = createFinfoldIcon("Quote", faQuoteLeft, "regular");
export const Radar = createFinfoldIcon("Radar", faRadar, "regular");
export const Radio = createFinfoldIcon("Radio", faRadio, "regular");
export const RadioTower = createFinfoldIcon("RadioTower", faTowerBroadcast, "regular");
export const ReceiptText = createFinfoldIcon("ReceiptText", faReceipt, "regular");
export const RefreshCcw = createFinfoldIcon("RefreshCcw", faRotateLeft, "regular");
export const RefreshCw = createFinfoldIcon("RefreshCw", faRotateRight, "regular");
export const Repeat2 = createFinfoldIcon("Repeat2", faRepeat, "regular");
export const Rocket = createFinfoldIcon("Rocket", faSignatureRocket, "signature");
export const RotateCcw = createFinfoldIcon("RotateCcw", faArrowRotateLeft, "regular");
export const Save = createFinfoldIcon("Save", faSave, "regular");
export const ScanLine = createFinfoldIcon("ScanLine", faBarcodeScan, "regular");
export const Search = createFinfoldIcon("Search", faSearch, "regular");
export const Send = createFinfoldIcon("Send", faSend, "regular");
export const Settings = createFinfoldIcon("Settings", faGear, "regular");
export const Share2 = createFinfoldIcon("Share2", faShareNodes, "regular");
export const Shield = createFinfoldIcon("Shield", faShield, "regular");
export const ShieldAlert = createFinfoldIcon("ShieldAlert", faShieldExclamation, "regular");
export const ShieldCheck = createFinfoldIcon("ShieldCheck", faSignatureShieldCheck, "signature");
export const SlidersHorizontal = createFinfoldIcon("SlidersHorizontal", faSliders, "regular");
export const Smartphone = createFinfoldIcon("Smartphone", faMobileScreenButton, "regular");
export const Sparkles = createFinfoldIcon("Sparkles", faSignatureSparkles, "signature");
export const Square = createFinfoldIcon("Square", faSquare, "regular");
export const Star = createFinfoldIcon("Star", faStar, "regular");
export const Store = createFinfoldIcon("Store", faStore, "regular");
export const Sun = createFinfoldIcon("Sun", faSun, "regular");
export const Target = createFinfoldIcon("Target", faSignatureBullseye, "signature");
export const ThumbsDown = createFinfoldIcon("ThumbsDown", faThumbsDown, "regular");
export const ThumbsUp = createFinfoldIcon("ThumbsUp", faThumbsUp, "regular");
export const TicketCheck = createFinfoldIcon("TicketCheck", faTicket, "regular");
export const Trash2 = createFinfoldIcon("Trash2", faTrashCan, "regular");
export const TrendingUp = createFinfoldIcon("TrendingUp", faArrowTrendUp, "regular");
export const TriangleAlert = createFinfoldIcon("TriangleAlert", faTriangleExclamation, "regular");
export const Unlink = createFinfoldIcon("Unlink", faUnlink, "regular");
export const Upload = createFinfoldIcon("Upload", faUpload, "regular");
export const User = createFinfoldIcon("User", faUser, "regular");
export const UserPlus = createFinfoldIcon("UserPlus", faUserPlus, "regular");
export const UserRound = createFinfoldIcon("UserRound", faCircleUser, "regular");
export const Users = createFinfoldIcon("Users", faUsers, "regular");
export const UsersRound = createFinfoldIcon("UsersRound", faUsers, "regular");
export const Wand2 = createFinfoldIcon("Wand2", faSignatureWandMagic, "signature");
export const WandSparkles = createFinfoldIcon("WandSparkles", faSignatureWandSparkles, "signature");
export const Wrench = createFinfoldIcon("Wrench", faWrench, "regular");
export const X = createFinfoldIcon("X", faLightX, "light");
export const XCircle = createFinfoldIcon("XCircle", faCircleXmark, "regular");
export const Zap = createFinfoldIcon("Zap", faSignatureZap, "signature");
