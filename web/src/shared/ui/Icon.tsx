import {
  Activity, ArrowRight, Eye, House, LogIn, UserCheck, Check, ChevronDown, ChevronRight, CircleCheck, CircleHelp, Clock, Copy, ExternalLink,
  LayoutGrid, Link, Lock, Maximize2, Menu, MessageCircle, Minimize2, Monitor, Moon, Play, ScreenShare,
  SendHorizontal, ShieldCheck, Sun, TriangleAlert, X, Info, Volume2, MousePointer2, FileText, Camera, PictureInPicture2, EyeOff, ZoomIn, VolumeX, Mic, MicOff, FileUp, FileDown, Download, BookUser, Pencil, Trash2, Plus, SquareArrowOutUpRight,
} from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/** App icon names mapped onto lucide (the shadcn/ui icon set). */
const icons = {
  grid: LayoutGrid,
  home: House,
  eye: Eye,
  userCheck: UserCheck,
  join: LogIn,
  screen: Monitor,
  screenShare: ScreenShare,
  arrow: ArrowRight,
  share: ExternalLink,
  clock: Clock,
  help: CircleHelp,
  shield: ShieldCheck,
  link: Link,
  copy: Copy,
  expand: Maximize2,
  shrink: Minimize2,
  check: Check,
  checkCircle: CircleCheck,
  close: X,
  play: Play,
  signal: Activity,
  lock: Lock,
  chevron: ChevronRight,
  chevronDown: ChevronDown,
  chat: MessageCircle,
  send: SendHorizontal,
  menu: Menu,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  alert: TriangleAlert,
  info: Info,
  audio: Volume2,
  pointer: MousePointer2,
  file: FileText,
  screenshot: Camera,
  pictureInPicture: PictureInPicture2,
  privacy: EyeOff,
  actualSize: ZoomIn,
  audioOff: VolumeX,
  mic: Mic,
  micOff: MicOff,
  fileOutgoing: FileUp,
  fileIncoming: FileDown,
  save: Download,
  contacts: BookUser,
  edit: Pencil,
  remove: Trash2,
  add: Plus,
  popOut: SquareArrowOutUpRight,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

interface IconProps extends Omit<LucideProps, 'name' | 'ref'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" {...rest} />;
}
