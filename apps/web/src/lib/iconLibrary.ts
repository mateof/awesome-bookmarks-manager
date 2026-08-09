import {
  Anchor,
  Archive,
  AtSign,
  Bell,
  Bike,
  Binary,
  Book,
  BookOpen,
  Bookmark,
  Bot,
  Boxes,
  Braces,
  Briefcase,
  Cake,
  Calendar,
  Camera,
  Car,
  Clipboard,
  Clock,
  Cloud,
  CloudRain,
  Code,
  Coffee,
  Coins,
  Compass,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  Dumbbell,
  File,
  FileText,
  Film,
  Flag,
  Folder,
  FolderOpen,
  GitBranch,
  Gamepad2,
  Gift,
  Globe,
  Headphones,
  Heart,
  House,
  IceCream,
  Image,
  Info,
  Layers,
  Leaf,
  Link,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageCircle,
  Mic,
  Moon,
  Mountain,
  Music,
  Newspaper,
  Paperclip,
  Palette,
  Pin,
  Phone,
  Pizza,
  Plane,
  Play,
  Podcast,
  Radio,
  Receipt,
  Rocket,
  Rss,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Table,
  Tag,
  Target,
  Terminal,
  Trees,
  Trophy,
  Tv,
  User,
  Users,
  Utensils,
  Video,
  Wallet,
  Wifi,
  Wine,
  Zap,
} from "lucide-react";

export interface LibIcon {
  name: string;
  Icon: LucideIcon;
}

export interface IconCategory {
  key: string;
  icons: LibIcon[];
}

const cat = (key: string, entries: Record<string, LucideIcon>): IconCategory => ({
  key,
  icons: Object.entries(entries).map(([name, Icon]) => ({ name, Icon })),
});

export const ICON_CATEGORIES: IconCategory[] = [
  cat("general", {
    Star, Heart, Bookmark, Flag, House, User, Users, Settings, Search, Bell,
    Calendar, Clock, MapPin, Globe, Info, Shield, Pin, Target,
  }),
  cat("work", {
    Folder, FolderOpen, File, FileText, Briefcase, Archive, Clipboard, Book,
    BookOpen, Newspaper, Paperclip, Table, Layers,
  }),
  cat("dev", {
    Code, Terminal, Cpu, Database, Server, GitBranch, Cloud, Wifi, Zap, Bot,
    Binary, Braces, Boxes,
  }),
  cat("media", {
    Image, Camera, Video, Music, Film, Mic, Headphones, Play, Radio, Tv, Podcast,
  }),
  cat("shopping", {
    ShoppingCart, ShoppingBag, CreditCard, DollarSign, Wallet, Gift, Tag, Coins,
    Receipt,
  }),
  cat("comms", {
    Mail, MessageCircle, Send, Phone, AtSign, Share2, Link, Rss, Megaphone,
  }),
  cat("travel", {
    Sun, Moon, CloudRain, Leaf, Trees, Mountain, Plane, Car, Bike, Rocket,
    Anchor, Compass, Map: MapIcon,
  }),
  cat("life", {
    Coffee, Pizza, Utensils, Wine, Cake, IceCream, Gamepad2, Trophy, Dumbbell,
    Palette, Sparkles,
  }),
];

/** A short, hand-picked row shown first ("most common"). */
export const COMMON_ICON_NAMES: string[] = [
  "Star", "Heart", "Bookmark", "Folder", "House", "Globe", "Code", "Book",
  "Image", "Music", "ShoppingCart", "Mail", "Calendar", "Coffee", "Rocket",
  "Sparkles",
];

const ALL: LibIcon[] = ICON_CATEGORIES.flatMap((c) => c.icons);
const BY_NAME = new Map(
  ALL.map((i) => [i.name.toLowerCase(), i] as [string, LibIcon]),
);

export function findIcon(name: string): LibIcon | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export const COMMON_ICONS: LibIcon[] = COMMON_ICON_NAMES.map(
  (n) => findIcon(n)!,
).filter(Boolean);

/** Case-insensitive substring search across the curated set. */
export function searchIcons(q: string): LibIcon[] {
  const s = q.trim().toLowerCase();
  if (!s) return ALL;
  return ALL.filter((i) => i.name.toLowerCase().includes(s));
}
