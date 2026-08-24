/**
 * One labelled block on a folder or bookmark page: tags, description, files.
 *
 * They used to be three bare stacks separated by nothing but vertical space,
 * so where one ended and the next began was a guess — the chips of a tag row
 * and the first line of a description read as one paragraph. Attachments
 * already had a header of exactly this shape; the fix was to stop it being the
 * only one that did.
 *
 * The separation is a hairline rule and a small caps label, not a card. Boxing
 * each block would draw three heavy frames around content that is mostly a
 * couple of chips, and make the page look busier than what is on it.
 */
export function EntitySection({
  icon,
  title,
  count,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** Shown next to the title when there is more than nothing to count. */
  count?: number;
  /** The one thing you do here, kept at the far right of the header row. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span className="text-slate-400">{icon}</span>
          {title}
          {count !== undefined && count > 0 && (
            <span className="text-slate-400">({count})</span>
          )}
        </h2>
        {action && <div className="ml-auto flex items-center">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * The small button that sits in a section header.
 *
 * Quiet on purpose: these are secondary actions next to the content they act
 * on, and three filled buttons down the page would compete with the toolbar
 * that runs the page.
 */
export function SectionAction({
  onClick,
  icon,
  children,
  title,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(title ? { title } : {})}
      className="flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {icon}
      {children}
    </button>
  );
}
