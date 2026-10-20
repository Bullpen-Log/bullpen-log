import { forwardRef, type SVGProps } from 'react';
import * as L from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { Baseball as BaseballRaw, BaseballBat as BaseballBatRaw } from '@/components/baseball-icon';

/**
 * 아이콘 체계 — 앱의 모든 아이콘은 이 파일에서 받는다(2026-10-14, docs/designs/icon-system.md).
 *
 * 왜: 178개 파일이 lucide 를 직접 불러 쓰고 55개 파일이 선 굵기(strokeWidth)를 제각각 줬다. 그래서 "아이폰 느낌으로"
 * 바꾸려 해도 한 곳에서 안 바뀌었다. 이제 화면 코드는 `lucide-react` 를 직접 부르지 않고 여기서 같은 이름으로 받는다
 * (eslint 의 no-restricted-imports 가 막는다). 굵기는 여기 하나 — 기본 2.5(24px 기준, 작으면 비례해 가늘어진다).
 * 아이폰 SF Symbols 의 Semibold 에 가깝다. 켜진 · 꺼진 상태는 굵기가 아니라 색으로 갈린다.
 *
 * 크기는 쓰던 대로 className(h-4 w-4 …)으로. 원 안에 넣을 때는 components/icon-circle.tsx.
 *
 * 새 아이콘이 필요하면 아래 목록에 한 줄 더한다. 목록에 없는 lucide 아이콘을 화면에서 직접 부르면 eslint 가 막는다.
 */
export const ICON_STROKE = 2.5;

export type { LucideIcon, LucideProps };

function weighted(Raw: LucideIcon): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function Icon(props, ref) {
    return <Raw ref={ref} strokeWidth={ICON_STROKE} {...props} />;
  });
  Icon.displayName = Raw.displayName ?? 'Icon';
  return Icon as unknown as LucideIcon;
}

export const Activity = weighted(L.Activity);
export const AlertCircle = weighted(L.AlertCircle);
export const AlertTriangle = weighted(L.AlertTriangle);
export const ArrowDown = weighted(L.ArrowDown);
export const ArrowDownRight = weighted(L.ArrowDownRight);
export const ArrowLeft = weighted(L.ArrowLeft);
export const ArrowLeftRight = weighted(L.ArrowLeftRight);
export const ArrowRight = weighted(L.ArrowRight);
export const ArrowRightLeft = weighted(L.ArrowRightLeft);
export const ArrowUp = weighted(L.ArrowUp);
export const ArrowUpDown = weighted(L.ArrowUpDown);
export const Box = weighted(L.Box);
export const ArrowUpRight = weighted(L.ArrowUpRight);
export const Baseball = weighted(BaseballRaw);
export const BaseballBat = weighted(BaseballBatRaw);
export const Bell = weighted(L.Bell);
export const BookOpen = weighted(L.BookOpen);
export const BookmarkPlus = weighted(L.BookmarkPlus);
export const CalendarClock = weighted(L.CalendarClock);
export const CalendarDays = weighted(L.CalendarDays);
export const Camera = weighted(L.Camera);
export const CameraOff = weighted(L.CameraOff);
export const ChartLine = weighted(L.ChartLine);
export const ChartNoAxesColumn = weighted(L.ChartNoAxesColumn);
export const Check = weighted(L.Check);
export const CheckCircle2 = weighted(L.CheckCircle2);
export const ChefHat = weighted(L.ChefHat);
export const ChevronDown = weighted(L.ChevronDown);
export const ChevronLeft = weighted(L.ChevronLeft);
export const ChevronRight = weighted(L.ChevronRight);
export const ChevronUp = weighted(L.ChevronUp);
export const ChevronsLeft = weighted(L.ChevronsLeft);
export const ChevronsRight = weighted(L.ChevronsRight);
export const ChevronsUpDown = weighted(L.ChevronsUpDown);
export const Circle = weighted(L.Circle);
export const CircleAlert = weighted(L.CircleAlert);
export const CircleCheck = weighted(L.CircleCheck);
export const Clapperboard = weighted(L.Clapperboard);
export const ClipboardCheck = weighted(L.ClipboardCheck);
export const ClipboardList = weighted(L.ClipboardList);
export const Clock3 = weighted(L.Clock3);
export const CloudOff = weighted(L.CloudOff);
export const CloudUpload = weighted(L.CloudUpload);
export const Coffee = weighted(L.Coffee);
export const Columns2 = weighted(L.Columns2);
export const Crosshair = weighted(L.Crosshair);
export const Database = weighted(L.Database);
export const Delete = weighted(L.Delete);
export const Dumbbell = weighted(L.Dumbbell);
export const Ellipsis = weighted(L.Ellipsis);
export const Eraser = weighted(L.Eraser);
export const ExternalLink = weighted(L.ExternalLink);
export const Eye = weighted(L.Eye);
export const EyeOff = weighted(L.EyeOff);
export const FileText = weighted(L.FileText);
export const FileVideo = weighted(L.FileVideo);
export const Film = weighted(L.Film);
export const Flag = weighted(L.Flag);
export const Flame = weighted(L.Flame);
export const FlaskConical = weighted(L.FlaskConical);
export const Focus = weighted(L.Focus);
export const Folder = weighted(L.Folder);
export const Footprints = weighted(L.Footprints);
export const Gauge = weighted(L.Gauge);
export const GitCommitHorizontal = weighted(L.GitCommitHorizontal);
export const Grid2x2 = weighted(L.Grid2x2);
export const Hand = weighted(L.Hand);
export const HeartPulse = weighted(L.HeartPulse);
export const History = weighted(L.History);
export const House = weighted(L.House);
export const ImagePlus = weighted(L.ImagePlus);
export const Images = weighted(L.Images);
export const Info = weighted(L.Info);
export const KeyRound = weighted(L.KeyRound);
export const Layers = weighted(L.Layers);
export const LayoutGrid = weighted(L.LayoutGrid);
export const Leaf = weighted(L.Leaf);
export const Lightbulb = weighted(L.Lightbulb);
export const List = weighted(L.List);
export const ListOrdered = weighted(L.ListOrdered);
export const Loader2 = weighted(L.Loader2);
export const Lock = weighted(L.Lock);
export const LockKeyhole = weighted(L.LockKeyhole);
export const LogOut = weighted(L.LogOut);
export const MapPin = weighted(L.MapPin);
export const Maximize2 = weighted(L.Maximize2);
export const Menu = weighted(L.Menu);
export const Minimize2 = weighted(L.Minimize2);
export const Minus = weighted(L.Minus);
export const Monitor = weighted(L.Monitor);
export const Moon = weighted(L.Moon);
export const MoonStar = weighted(L.MoonStar);
export const Move = weighted(L.Move);
export const MoveDiagonal2 = weighted(L.MoveDiagonal2);
export const MoveHorizontal = weighted(L.MoveHorizontal);
export const MoveVertical = weighted(L.MoveVertical);
export const NotebookPen = weighted(L.NotebookPen);
export const Paperclip = weighted(L.Paperclip);
export const Pause = weighted(L.Pause);
export const PauseCircle = weighted(L.PauseCircle);
export const Pencil = weighted(L.Pencil);
export const PencilLine = weighted(L.PencilLine);
export const PersonStanding = weighted(L.PersonStanding);
export const Play = weighted(L.Play);
export const Plus = weighted(L.Plus);
export const Radar = weighted(L.Radar);
export const RefreshCw = weighted(L.RefreshCw);
export const Repeat = weighted(L.Repeat);
export const Replace = weighted(L.Replace);
export const Rotate3d = weighted(L.Rotate3d);
export const RotateCcw = weighted(L.RotateCcw);
export const RotateCw = weighted(L.RotateCw);
export const Ruler = weighted(L.Ruler);
export const Scale = weighted(L.Scale);
export const Scan = weighted(L.Scan);
export const ScanBarcode = weighted(L.ScanBarcode);
export const Scissors = weighted(L.Scissors);
export const ScrollText = weighted(L.ScrollText);
export const Search = weighted(L.Search);
export const Settings = weighted(L.Settings);
export const Settings2 = weighted(L.Settings2);
export const Shield = weighted(L.Shield);
export const ShieldCheck = weighted(L.ShieldCheck);
export const ShieldOff = weighted(L.ShieldOff);
export const ShieldPlus = weighted(L.ShieldPlus);
export const Shuffle = weighted(L.Shuffle);
export const SkipBack = weighted(L.SkipBack);
export const SkipForward = weighted(L.SkipForward);
export const SlidersHorizontal = weighted(L.SlidersHorizontal);
export const Smartphone = weighted(L.Smartphone);
export const Sparkles = weighted(L.Sparkles);
export const Sprout = weighted(L.Sprout);
export const Square = weighted(L.Square);
export const Star = weighted(L.Star);
export const Stethoscope = weighted(L.Stethoscope);
export const StickyNote = weighted(L.StickyNote);
export const Sun = weighted(L.Sun);
export const SunMoon = weighted(L.SunMoon);
export const Target = weighted(L.Target);
export const Timer = weighted(L.Timer);
export const Trash2 = weighted(L.Trash2);
export const TrendingDown = weighted(L.TrendingDown);
export const Triangle = weighted(L.Triangle);
export const TriangleAlert = weighted(L.TriangleAlert);
export const Trophy = weighted(L.Trophy);
export const Undo2 = weighted(L.Undo2);
export const Upload = weighted(L.Upload);
export const UserCog = weighted(L.UserCog);
export const UserMinus = weighted(L.UserMinus);
export const UserRound = weighted(L.UserRound);
export const Utensils = weighted(L.Utensils);
export const Video = weighted(L.Video);
export const VideoOff = weighted(L.VideoOff);
export const VolumeX = weighted(L.VolumeX);
export const Waves = weighted(L.Waves);
export const Wrench = weighted(L.Wrench);
export const X = weighted(L.X);
export const Zap = weighted(L.Zap);
/* 고객센터 · 커뮤니티(2026-10-17) */
export const LifeBuoy = weighted(L.LifeBuoy);
export const MessagesSquare = weighted(L.MessagesSquare);
export const MessageCircle = weighted(L.MessageCircle);
export const Heart = weighted(L.Heart);
export const Send = weighted(L.Send);
export const Megaphone = weighted(L.Megaphone);
export const CircleHelp = weighted(L.CircleHelp);
export const Pin = weighted(L.Pin);
export const Users = weighted(L.Users);
export const ZoomIn = weighted(L.ZoomIn);

/** 전부 — 임시 미리보기 · 시험이 한 판으로 훑는다 */
export const ALL_ICONS: Record<string, LucideIcon> = {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Baseball,
  BaseballBat,
  Bell,
  BookOpen,
  BookmarkPlus,
  CalendarClock,
  CalendarDays,
  Camera,
  CameraOff,
  ChartLine,
  ChartNoAxesColumn,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Circle,
  CircleAlert,
  CircleCheck,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  CloudOff,
  CloudUpload,
  Coffee,
  Columns2,
  Crosshair,
  Box,
  Database,
  Delete,
  Dumbbell,
  Ellipsis,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileVideo,
  Film,
  Flag,
  Flame,
  FlaskConical,
  Focus,
  Footprints,
  Gauge,
  GitCommitHorizontal,
  Grid2x2,
  Hand,
  HeartPulse,
  History,
  House,
  ImagePlus,
  Images,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  Leaf,
  Lightbulb,
  List,
  ListOrdered,
  Loader2,
  Lock,
  LockKeyhole,
  LogOut,
  MapPin,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  Monitor,
  Moon,
  MoonStar,
  Move,
  MoveDiagonal2,
  MoveHorizontal,
  MoveVertical,
  NotebookPen,
  Paperclip,
  Pause,
  PauseCircle,
  Pencil,
  PencilLine,
  PersonStanding,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Repeat,
  Replace,
  Rotate3d,
  RotateCcw,
  RotateCw,
  Ruler,
  Scale,
  Scan,
  ScanBarcode,
  Scissors,
  ScrollText,
  Search,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  ShieldOff,
  ShieldPlus,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sprout,
  Square,
  Star,
  Stethoscope,
  StickyNote,
  Sun,
  SunMoon,
  Target,
  Timer,
  Trash2,
  TrendingDown,
  Triangle,
  TriangleAlert,
  Trophy,
  Undo2,
  Upload,
  UserCog,
  UserMinus,
  UserRound,
  Utensils,
  Video,
  VideoOff,
  VolumeX,
  Waves,
  Wrench,
  X,
  Zap,
  ZoomIn,
  LifeBuoy,
  MessagesSquare,
  MessageCircle,
  Heart,
  Send,
  Megaphone,
  CircleHelp,
  Pin,
  Users,
};

export type IconProps = SVGProps<SVGSVGElement>;
