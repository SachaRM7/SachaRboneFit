/**
 * Application icon vocabulary.
 *
 * Keep icon selection in one place so every screen uses the same Tabler
 * outline glyph for a given concept. Tabler icons inherit `currentColor` and
 * keep their normal outline stroke unless a component explicitly overrides it.
 */
import type { TablerIcon } from "@tabler/icons-react";

export type AppIcon = TablerIcon;

// Navigation and common actions.
export {
  IconArrowDown as ArrowDown,
  IconArrowLeft as ArrowLeft,
  IconArrowRight as ArrowRight,
  IconArrowUp as ArrowUp,
  IconArrowUpRight as ArrowUpRight,
  IconArrowsLeftRight as ArrowLeftRight,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
  IconChevronUp as ChevronUp,
  IconDots as Ellipsis,
  IconGripVertical as GripVertical,
  IconMinus as Minus,
  IconPencil as Pencil,
  IconPlus as Plus,
  IconRefresh as RefreshCw,
  IconSearch as Search,
  IconTrash as Trash2,
  IconX as X,
  IconX as XIcon,
  IconCopy as Copy,
  IconSend as Send,
} from "@tabler/icons-react";

// Workout vocabulary.
export {
  IconActivity as Activity,
  IconActivityHeartbeat as HeartPulse,
  IconBarbell as Barbell,
  IconDumbbell as Dumbbell,
  IconHourglass as Hourglass,
  IconRepeat as Repeat,
  IconStopwatch as TimerReset,
  IconStopwatch as Stopwatch,
  IconTarget as Target,
  IconWeight as Scale,
  IconWeight as Weight,
  IconRulerMeasure as Ruler,
  IconRulerMeasure as RulerMeasure,
  IconChartLine as BarChart3,
  IconChartLine as ChartNoAxesCombined,
  IconClock as Clock,
  IconClock as Clock3,
  IconAdjustmentsHorizontal as SlidersHorizontal,
  IconFocus as Focus,
  IconList as LayoutList,
  IconGauge as CircleGauge,
  IconBattery2 as BatteryLow,
  IconClockPause as ClockPause,
  IconActivity as Tempo,
  IconTargetArrow as TargetArrow,
  IconListCheck as ListCheck,
  IconBodyScan as BodyScan,
  IconCalendarEvent as CalendarEvent,
} from "@tabler/icons-react";

// Content, status and system actions.
export {
  IconAlertOctagon as AlertOctagon,
  IconAlertTriangle as AlertTriangle,
  IconAlertTriangle as TriangleAlert,
  IconAlertTriangle as TriangleAlertIcon,
  IconCircleCheck as CheckCircle2,
  IconCircleCheck as CircleCheckIcon,
  IconCircleX as CircleXIcon,
  IconInfoCircle as Info,
  IconInfoCircle as InfoIcon,
  IconHelpCircle as HelpCircle,
  IconPencil as Edit3,
  IconLoader2 as Loader2,
  IconLoader2 as Loader2Icon,
  IconPlayerPause as Pause,
  IconPlayerPlay as Play,
  IconRotate as RotateCcw,
  IconRotate3d as Rotate3D,
  IconSparkles as Sparkles,
  IconTrophy as Trophy,
  IconTrendingDown as TrendingDown,
  IconTrendingUp as TrendingUp,
  IconHistory as History,
} from "@tabler/icons-react";

// App navigation and settings.
export {
  IconBackpack as Backpack,
  IconBook as BookOpen,
  IconCalendar as Calendar,
  IconCalendar as CalendarRange,
  IconCalendarCheck as CalendarCheck,
  IconHome as Home,
  IconHome as House,
  IconMapPin as MapPin,
  IconMessageCircle as MessageCircle,
  IconMoon as Moon,
  IconShieldCheck as ShieldCheck,
  IconSun as Sun,
  IconSunMoon as SunMoon,
  IconPalette as Palette,
  IconTool as Wrench,
  IconUser as User,
  IconUser as UserRound,
  IconUsers as Users,
  IconWifiOff as WifiOff,
  IconBolt as Zap,
  IconSettings as Settings,
  IconDownload as Download,
  IconLogout as LogOut,
  IconArrowRight as MoveRight,
  IconDots as MoreHorizontal,
} from "@tabler/icons-react";

// Names kept for the generated UI primitives while their implementation is Tabler.
export {
  IconChevronDown as ChevronDownIcon,
  IconChevronUp as ChevronUpIcon,
  IconCheck as CheckIcon,
} from "@tabler/icons-react";
