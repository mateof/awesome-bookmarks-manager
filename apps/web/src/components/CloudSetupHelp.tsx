import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.js";

type Provider = "gdrive" | "onedrive" | "synology";

interface Props {
  provider: Provider;
  onClose: () => void;
}

export function CloudSetupHelp({ provider, onClose }: Props) {
  const { t } = useTranslation();
  const title = t(
    provider === "gdrive"
      ? "cloudHelp.gdriveTitle"
      : provider === "onedrive"
        ? "cloudHelp.onedriveTitle"
        : "cloudHelp.synologyTitle",
  );
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        {provider === "gdrive" && <GDriveHelp />}
        {provider === "onedrive" && <OneDriveHelp />}
        {provider === "synology" && <SynologyHelp />}
      </div>
    </Modal>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">
      <code>{children}</code>
    </pre>
  );
}

function GDriveHelp() {
  const { t } = useTranslation();
  const redirect =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/cloud/connect/gdrive/callback`
      : "http://localhost:3001/cloud/connect/gdrive/callback";
  const step3Items = t("cloudHelp.gdrive.step3Items", {
    returnObjects: true,
  }) as unknown as string[];
  const step4Items = t("cloudHelp.gdrive.step4Items", {
    returnObjects: true,
  }) as unknown as string[];
  return (
    <>
      <p>{t("cloudHelp.gdrive.intro")}</p>

      <h4>{t("cloudHelp.gdrive.step1")}</h4>
      <p>
        <ExtLink href="https://console.cloud.google.com/projectcreate">
          {t("cloudHelp.gdrive.step1LinkText")}
        </ExtLink>{" "}
        — {t("cloudHelp.gdrive.step1Text")}
      </p>

      <h4>{t("cloudHelp.gdrive.step2")}</h4>
      <p>
        <ExtLink href="https://console.cloud.google.com/apis/library/drive.googleapis.com">
          {t("cloudHelp.gdrive.step2LinkText")}
        </ExtLink>{" "}
        — {t("cloudHelp.gdrive.step2Text")}
      </p>

      <h4>{t("cloudHelp.gdrive.step3")}</h4>
      <ul>
        {step3Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h4>{t("cloudHelp.gdrive.step4")}</h4>
      <ul>
        {step4Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <CodeBlock>{redirect}</CodeBlock>
      <p>{t("cloudHelp.gdrive.step4Copy")}</p>

      <h4>{t("cloudHelp.gdrive.step5")}</h4>
      <CodeBlock>
        {`GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_REDIRECT_URI=${redirect}`}
      </CodeBlock>
      <p>{t("cloudHelp.gdrive.step5Restart")}</p>

      <h4>{t("cloudHelp.gdrive.step6")}</h4>
      <p>{t("cloudHelp.gdrive.step6Text")}</p>

      <h4>{t("cloudHelp.gdrive.trouble")}</h4>
      <ul>
        <li>
          <b>{t("cloudHelp.gdrive.trouble1Title")}</b>: {t("cloudHelp.gdrive.trouble1")}
        </li>
        <li>
          <b>{t("cloudHelp.gdrive.trouble2Title")}</b>: {t("cloudHelp.gdrive.trouble2")}
        </li>
        <li>
          <b>{t("cloudHelp.gdrive.trouble3Title")}</b>:{" "}
          <ExtLink href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </ExtLink>{" "}
          — {t("cloudHelp.gdrive.trouble3")}
        </li>
      </ul>
    </>
  );
}

function OneDriveHelp() {
  const { t } = useTranslation();
  const redirect =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/cloud/connect/onedrive/callback`
      : "http://localhost:3001/cloud/connect/onedrive/callback";
  const step1Items = t("cloudHelp.onedrive.step1Items", {
    returnObjects: true,
  }) as unknown as string[];
  const step2Items = t("cloudHelp.onedrive.step2Items", {
    returnObjects: true,
  }) as unknown as string[];
  const step3Items = t("cloudHelp.onedrive.step3Items", {
    returnObjects: true,
  }) as unknown as string[];
  return (
    <>
      <p>{t("cloudHelp.onedrive.intro")}</p>

      <h4>{t("cloudHelp.onedrive.step1")}</h4>
      <p>
        <ExtLink href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">
          {t("cloudHelp.onedrive.step1Text")}
        </ExtLink>
      </p>
      <ul>
        {step1Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <CodeBlock>{redirect}</CodeBlock>

      <h4>{t("cloudHelp.onedrive.step2")}</h4>
      <ul>
        {step2Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h4>{t("cloudHelp.onedrive.step3")}</h4>
      <ul>
        {step3Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h4>{t("cloudHelp.onedrive.step4")}</h4>
      <CodeBlock>
        {`MS_CLIENT_ID=tu-application-client-id
MS_CLIENT_SECRET=tu-secret-value
MS_REDIRECT_URI=${redirect}`}
      </CodeBlock>
      <p>{t("cloudHelp.onedrive.step4Restart")}</p>

      <h4>{t("cloudHelp.onedrive.step5")}</h4>
      <p>{t("cloudHelp.onedrive.step5Text")}</p>

      <h4>{t("cloudHelp.onedrive.trouble")}</h4>
      <ul>
        <li>
          <b>{t("cloudHelp.onedrive.trouble1Title")}</b>: {t("cloudHelp.onedrive.trouble1")}
        </li>
        <li>
          <b>{t("cloudHelp.onedrive.trouble2Title")}</b>: {t("cloudHelp.onedrive.trouble2")}
        </li>
      </ul>
    </>
  );
}

function SynologyHelp() {
  const { t } = useTranslation();
  const step2Items = t("cloudHelp.synology.step2Items", {
    returnObjects: true,
  }) as unknown as string[];
  const step3Items = t("cloudHelp.synology.step3Items", {
    returnObjects: true,
  }) as unknown as string[];
  const step4Items = t("cloudHelp.synology.step4Items", {
    returnObjects: true,
  }) as unknown as string[];
  return (
    <>
      <p>{t("cloudHelp.synology.intro")}</p>

      <h4>{t("cloudHelp.synology.step1")}</h4>
      <p>{t("cloudHelp.synology.step1Text")}</p>

      <h4>{t("cloudHelp.synology.step2")}</h4>
      <ul>
        {step2Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h4>{t("cloudHelp.synology.step3")}</h4>
      <ul>
        {step3Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h4>{t("cloudHelp.synology.step4")}</h4>
      <p>{t("cloudHelp.synology.step4Text")}</p>
      <ul>
        {step4Items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h4>{t("cloudHelp.synology.step5")}</h4>
      <p>{t("cloudHelp.synology.step5Text")}</p>

      <h4>{t("cloudHelp.synology.trouble")}</h4>
      <ul>
        <li>
          <b>{t("cloudHelp.synology.trouble1Title")}</b>: {t("cloudHelp.synology.trouble1")}
        </li>
        <li>
          <b>{t("cloudHelp.synology.trouble2Title")}</b>: {t("cloudHelp.synology.trouble2")}
        </li>
        <li>
          <b>{t("cloudHelp.synology.trouble3Title")}</b>: {t("cloudHelp.synology.trouble3")}
        </li>
        <li>
          <b>{t("cloudHelp.synology.trouble4Title")}</b>: {t("cloudHelp.synology.trouble4")}
        </li>
      </ul>
    </>
  );
}
