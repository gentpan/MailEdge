/**
 * 站点自绘细线图标（替代 lucide-react），导出名与 lucide 保持一致。
 * 每个图标同时带超椭圆版和直角版，由 <html data-corners> 决定显示哪一套（见 icons.css），切换转角主题无需重新渲染。
 * 图形由 OpenMail/design/icons/export_react.py 生成，改图标请改那边的母版后重新导出。
 */
import type { SVGProps } from "react";
import "./icons.css";
import { ICON_SHAPES, type IconShapeName } from "./shapes";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

export type IconComponent = ((props: IconProps) => React.JSX.Element) & { displayName?: string };

function createIcon(name: IconShapeName, displayName: string): IconComponent {
  const { squircle, sharp } = ICON_SHAPES[name];
  const Icon: IconComponent = ({ size = 24, strokeWidth = 1.5, className, ...rest }) => (
    // biome-ignore lint/a11y/noSvgWithoutTitle: 装饰性图标默认 aria-hidden；需要朗读时由调用方传 aria-label
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden={rest["aria-label"] ? undefined : true}
      className={className ? `icon icon-${name} ${className}` : `icon icon-${name}`}
      {...rest}
    >
      <g className="icon-squircle" strokeLinecap="round" strokeLinejoin="round">
        {squircle}
      </g>
      <g className="icon-sharp" strokeLinecap="square" strokeLinejoin="miter">
        {sharp}
      </g>
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const AlertTriangle = createIcon("triangle-alert", "AlertTriangle");
export const Archive = createIcon("archive-box", "Archive");
export const ArchiveRestore = createIcon("archive-box-up", "ArchiveRestore");
export const ArrowLeft = createIcon("arrow-left", "ArrowLeft");
export const AtSign = createIcon("at-sign", "AtSign");
export const BarChart3 = createIcon("chart-axis", "BarChart3");
export const Bell = createIcon("bell", "Bell");
export const Bold = createIcon("bold", "Bold");
export const BookOpen = createIcon("book-open", "BookOpen");
export const Check = createIcon("check", "Check");
export const CheckCheck = createIcon("check-double", "CheckCheck");
export const CheckCircle2 = createIcon("circle-check", "CheckCircle2");
export const ChevronDown = createIcon("chevron-down", "ChevronDown");
export const ChevronLeft = createIcon("chevron-left", "ChevronLeft");
export const ChevronRight = createIcon("chevron-right", "ChevronRight");
export const ChevronUp = createIcon("chevron-up", "ChevronUp");
export const CircleAlert = createIcon("circle-alert", "CircleAlert");
export const CircleDashed = createIcon("circle-dashed", "CircleDashed");
export const Clock3 = createIcon("clock", "Clock3");
export const Cloud = createIcon("cloud", "Cloud");
export const Code2 = createIcon("code-brackets", "Code2");
export const ContactRound = createIcon("contact-card", "ContactRound");
export const Copy = createIcon("copy", "Copy");
export const Copyright = createIcon("copyright", "Copyright");
export const Database = createIcon("database", "Database");
export const Download = createIcon("download", "Download");
export const ExternalLink = createIcon("external-link", "ExternalLink");
export const FileText = createIcon("document", "FileText");
export const Folder = createIcon("folder", "Folder");
export const FolderPlus = createIcon("folder-plus", "FolderPlus");
export const Forward = createIcon("arrow-forward", "Forward");
export const Github = createIcon("github", "Github");
export const Globe = createIcon("globe", "Globe");
export const GripVertical = createIcon("grip-dots", "GripVertical");
export const HardDrive = createIcon("hard-drive", "HardDrive");
export const Heading2 = createIcon("heading", "Heading2");
export const Inbox = createIcon("inbox-tray", "Inbox");
export const Info = createIcon("info", "Info");
export const Italic = createIcon("italic", "Italic");
export const KeyRound = createIcon("key", "KeyRound");
export const LayoutDashboard = createIcon("dashboard", "LayoutDashboard");
export const Link2 = createIcon("link", "Link2");
export const List = createIcon("list", "List");
export const ListOrdered = createIcon("list-numbered", "ListOrdered");
export const Loader2 = createIcon("spinner", "Loader2");
export const LogOut = createIcon("door-exit", "LogOut");
export const Mail = createIcon("mail", "Mail");
export const MailOpen = createIcon("mail-open", "MailOpen");
export const MailPlus = createIcon("mail-plus", "MailPlus");
export const Minus = createIcon("minus", "Minus");
export const Moon = createIcon("moon", "Moon");
export const MoreHorizontal = createIcon("dots-horizontal", "MoreHorizontal");
export const Palette = createIcon("palette", "Palette");
export const PanelLeftClose = createIcon("panel-left", "PanelLeftClose");
export const Paperclip = createIcon("paperclip", "Paperclip");
export const PenSquare = createIcon("square-pen", "PenSquare");
export const Pencil = createIcon("pencil", "Pencil");
export const Plus = createIcon("plus", "Plus");
export const Quote = createIcon("quote", "Quote");
export const RefreshCw = createIcon("refresh", "RefreshCw");
export const Reply = createIcon("reply", "Reply");
export const ReplyAll = createIcon("reply-all", "ReplyAll");
export const RotateCw = createIcon("rotate", "RotateCw");
export const Rows3 = createIcon("rows-3", "Rows3");
export const Rows4 = createIcon("rows-4", "Rows4");
export const Save = createIcon("floppy", "Save");
export const Scale = createIcon("scale", "Scale");
export const Search = createIcon("search", "Search");
export const Send = createIcon("paper-plane", "Send");
export const SendHorizontal = createIcon("paper-plane-right", "SendHorizontal");
export const Server = createIcon("server", "Server");
export const Settings = createIcon("gear", "Settings");
export const Shapes = createIcon("shapes", "Shapes");
export const Shield = createIcon("shield", "Shield");
export const ShieldCheck = createIcon("shield-check", "ShieldCheck");
export const Sparkles = createIcon("sparkles", "Sparkles");
export const Star = createIcon("star", "Star");
export const Sun = createIcon("sun", "Sun");
export const Trash2 = createIcon("trash", "Trash2");
export const TriangleAlert = createIcon("triangle-alert", "TriangleAlert");
export const User = createIcon("user", "User");
export const UserPlus = createIcon("user-plus", "UserPlus");
export const Users = createIcon("users", "Users");
export const Wand2 = createIcon("magic-wand", "Wand2");
export const WandSparkles = createIcon("wand-star", "WandSparkles");
export const X = createIcon("close", "X");
export const XCircle = createIcon("circle-x", "XCircle");
export const Zap = createIcon("bolt", "Zap");
