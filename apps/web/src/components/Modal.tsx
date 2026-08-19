import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBackdropDismiss } from "../lib/overlay.js";

interface Props {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * Give the dialog a fixed height and let its content do the scrolling.
   *
   * The default is the right shape for a form: the dialog is as tall as it
   * needs to be and scrolls as a whole. It is the wrong shape for an editor,
   * where scrolling the dialog takes the toolbar and the save button off
   * screen exactly when a long text makes you want them. With `fill`, the
   * children get a flex column to lay themselves out in and are responsible
   * for their own overflow.
   */
  fill?: boolean;
}

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

export function Modal({
  title,
  children,
  onClose,
  size = "md",
  fill = false,
}: Props) {
  const { t } = useTranslation();
  const backdrop = useBackdropDismiss(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/40"
      {...backdrop}
    >
      <div
        className={`w-full ${SIZE[size]} rounded-t-lg sm:rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${
          fill
            ? "flex h-[85vh] max-h-[90vh] flex-col gap-3 overflow-hidden"
            : "max-h-[90vh] space-y-3 overflow-auto"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center ${fill ? "shrink-0" : ""}`}>
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
            className="ml-auto text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
