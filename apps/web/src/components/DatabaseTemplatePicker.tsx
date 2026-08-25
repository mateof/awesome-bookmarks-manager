import { DbTemplateSchema, type DbTemplate } from "@awesome-bookmarks/shared";
import { useTranslation } from "react-i18next";

/**
 * Which shape a new table starts in.
 *
 * A blank grid looks like freedom and behaves like homework: everyone invents
 * the same four columns, and inventing them badly (a status as free text, a
 * price as text) is what makes a table impossible to filter three months
 * later. Offering the shapes this app is actually used for costs one click and
 * saves the kinds being wrong.
 *
 * "Basic" stays first and is what everything used to do, so nobody who liked
 * the old behaviour has to learn anything.
 */
export function DatabaseTemplatePicker({
  value,
  onChange,
}: {
  value: DbTemplate;
  onChange: (next: DbTemplate) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {t("db.template.label")}
      </span>
      <select
        value={value}
        aria-label={t("db.template.label")}
        onChange={(e) => onChange(e.target.value as DbTemplate)}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
      >
        {DbTemplateSchema.options.map((k) => (
          <option key={k} value={k}>
            {t(`db.template.${k}` as "db.template.basic")}
          </option>
        ))}
      </select>
    </label>
  );
}
