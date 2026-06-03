import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group } from "@awesome-bookmarks/shared";
import {
  Copy,
  Mail,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { Modal } from "../components/Modal.js";

export function GroupsPage() {
  const { id } = useParams();
  if (id) return <GroupDetail id={id} />;
  return <GroupsList />;
}

function GroupsList() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.listGroups });
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: api.listMyInvitations,
  });
  const accept = useMutation({
    mutationFn: (token: string) => api.acceptInvitation(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
  const [showCreate, setShowCreate] = useState(false);
  const nav = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">{t("groups.listTitle")}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus className="h-4 w-4" /> {t("groups.newGroup")}
        </button>
      </div>

      {(invitations.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase text-slate-500">
            {t("groups.pendingInvitations")}
          </h2>
          {(invitations.data ?? []).map((inv: any) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex-1">
                <div className="font-medium">{inv.groupName}</div>
                <div className="text-xs text-slate-500">
                  {t("groups.invitedBy", { email: inv.invitedByEmail })}
                </div>
              </div>
              <button
                onClick={() => accept.mutate(inv.token)}
                className="rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
              >
                {t("groups.accept")}
              </button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase text-slate-500">
          {t("groups.yourGroups")}
        </h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {(groups.data ?? []).map((g) => (
            <GroupCard key={g.id} group={g} onClick={() => nav(`/groups/${g.id}`)} />
          ))}
          {(groups.data ?? []).length === 0 && (
            <div className="text-sm text-slate-400">{t("groups.noGroups")}</div>
          )}
        </div>
      </section>

      {showCreate && (
        <CreateGroupDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["groups"] })}
        />
      )}
    </div>
  );
}

function GroupCard({ group, onClick }: { group: Group; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-400" />
        <span className="font-medium">{group.name}</span>
      </div>
      {group.description && (
        <p className="line-clamp-2 text-xs text-slate-500">
          {group.description}
        </p>
      )}
      <div className="text-xs text-slate-400">
        {t("groups.memberCount", { count: group.memberCount })} · {group.myRole}
      </div>
    </button>
  );
}

function CreateGroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api.createGroup({ name, description: description || undefined }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });
  return (
    <Modal title={t("groups.dialogNewGroup")} onClose={onClose}>
      <div className="space-y-2">
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("groups.fieldGroupName")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("groups.fieldGroupDescription")}
          rows={3}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          disabled={!name || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("common.creating") : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}

function GroupDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const group = useQuery({
    queryKey: ["group", id],
    queryFn: () => api.getGroup(id),
  });
  const members = useQuery({
    queryKey: ["group-members", id],
    queryFn: () => api.listGroupMembers(id),
  });
  const shares = useQuery({
    queryKey: ["group-shares", id],
    queryFn: () => api.listGroupShares(id),
  });
  const [showInvite, setShowInvite] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  if (!group.data) return <div className="text-slate-400">{t("common.loading")}</div>;
  const g = group.data;
  const canManage = g.myRole === "owner" || g.myRole === "admin";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-5 w-5 text-slate-500" />
        <h1 className="text-xl font-semibold">{g.name}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {canManage && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <UserPlus className="h-4 w-4" /> {t("groups.invite")}
            </button>
          )}
          {g.myRole !== "owner" && (
            <button
              onClick={async () => {
                if (!confirm(t("groups.confirmLeave"))) return;
                await api.leaveGroup(id);
                nav("/groups");
              }}
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("groups.leave")}
            </button>
          )}
          {g.myRole === "owner" && (
            <button
              onClick={async () => {
                if (!confirm(t("groups.confirmDeleteGroup"))) return;
                await api.deleteGroup(id);
                nav("/groups");
              }}
              className="flex items-center gap-1 rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {g.description && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{g.description}</p>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase text-slate-500">
          {t("groups.membersHeading", { count: members.data?.length ?? 0 })}
        </h2>
        <div className="space-y-1">
          {(members.data ?? []).map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
            >
              <Mail className="h-4 w-4 text-slate-400" />
              <span>{m.email}</span>
              <span className="ml-auto text-xs text-slate-500">{m.role}</span>
              {canManage && m.role !== "owner" && (
                <button
                  onClick={async () => {
                    if (!confirm(t("groups.confirmRemoveMember", { email: m.email }))) return;
                    await api.removeGroupMember(id, m.userId);
                    qc.invalidateQueries({ queryKey: ["group-members", id] });
                  }}
                  title={t("groups.removeMember")}
                  className="text-slate-400 hover:text-red-600"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase text-slate-500">
          {t("groups.sharedHeading", { count: shares.data?.length ?? 0 })}
        </h2>
        {(shares.data ?? []).length === 0 ? (
          <div className="text-sm text-slate-400">{t("groups.nothingShared")}</div>
        ) : (
          <div className="space-y-1">
            {(shares.data ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="text-xs uppercase text-slate-400">
                  {s.sourceType}
                </span>
                <button
                  onClick={() => nav(`/shared/${s.id}`)}
                  className="flex-1 truncate text-left text-sm hover:underline"
                >
                  {s.id.slice(0, 8)}…
                </button>
                <span className="text-xs text-slate-500">
                  {t("groups.sharedBy", { email: s.sharedByEmail })}
                </span>
                <span className="text-xs uppercase text-slate-400">
                  {s.payloadStatus}
                </span>
                <button
                  onClick={async () => {
                    if (!confirm(t("groups.confirmRemoveShare"))) return;
                    await api.deleteGroupShare(id, s.id);
                    qc.invalidateQueries({ queryKey: ["group-shares", id] });
                  }}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showInvite && (
        <InviteDialog
          groupId={id}
          onClose={() => setShowInvite(false)}
          onInvited={(link) => setLastInviteLink(link)}
        />
      )}
      {lastInviteLink && (
        <Modal
          title={t("groups.inviteCreatedTitle")}
          onClose={() => setLastInviteLink(null)}
        >
          <div className="space-y-2">
            <p className="text-sm">{t("groups.inviteCreatedHint")}</p>
            <div className="flex items-center gap-2 rounded border border-slate-300 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
              <code className="flex-1 truncate text-xs">{lastInviteLink}</code>
              <button
                onClick={() => navigator.clipboard.writeText(lastInviteLink)}
                title={t("groups.copyTitle")}
                className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-slate-500">{t("groups.inviteOnlyOnce")}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InviteDialog({
  groupId,
  onClose,
  onInvited,
}: {
  groupId: string;
  onClose: () => void;
  onInvited: (link: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(30);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api.inviteMember(groupId, { email, expiresInDays: days }),
    onSuccess: (inv) => {
      const link = `${window.location.origin}/invite/${inv.token}`;
      onInvited(link);
      onClose();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });
  return (
    <Modal title={t("groups.dialogInviteTitle")} onClose={onClose}>
      <div className="space-y-2">
        <input
          autoFocus
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("groups.fieldEmail")}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <label className="block text-xs text-slate-500">
          {t("groups.expiresInDays")}
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-2 w-20 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          disabled={!email || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("groups.generating") : t("groups.generateInvite")}
        </button>
      </div>
    </Modal>
  );
}
