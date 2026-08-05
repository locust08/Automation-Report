"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilIcon, SaveIcon, SearchIcon, ShieldCheckIcon, UserPlusIcon, UsersRoundIcon, XIcon } from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { AUTH_ROLES, AUTH_ROLE_LABELS, type AuthRole } from "@/lib/auth/roles";
import type { ManagedUser } from "@/lib/auth/users";

export function UserManagementPageClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [role, setRole] = useState<AuthRole>("specialist");
  const [isActive, setIsActive] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.fullName, user.email, user.role, AUTH_ROLE_LABELS[user.role]]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [userSearch, users]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = (await response.json()) as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load users.");
      setUsers(payload.users ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.get("fullName"), email: formData.get("email"),
          password: formData.get("password"), role, isActive,
        }),
      });
      const payload = (await response.json()) as { user?: ManagedUser; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create user.");
      form.reset();
      setRole("specialist");
      setIsActive(true);
      setNotice("User created successfully.");
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ReportShell title="User Management" dateLabel="Administrator access" activeQuery="" reportReady={!loading}>
      <div className="space-y-5 text-neutral-950">
        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-700"><ShieldCheckIcon className="size-6" /></span><div><h2 className="text-xl font-semibold">Role-based access</h2><p className="mt-1 text-sm text-neutral-500">Create internal users, assign one role, deactivate access, or reset a password.</p></div></div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><UserPlusIcon className="size-5 text-red-700" /><h2 className="text-lg font-semibold">Create user</h2></div>
          <form onSubmit={createUser} className="grid gap-4 md:grid-cols-2">
            <LabeledField label="Full name"><Input name="fullName" required placeholder="Full name" /></LabeledField>
            <LabeledField label="Email"><Input name="email" type="email" required placeholder="name@locus-t.com.my" /></LabeledField>
            <LabeledField label="Password"><Input name="password" type="password" minLength={8} required placeholder="Minimum 8 characters" /></LabeledField>
            <LabeledField label="Role"><RoleSelect value={role} onChange={setRole} /></LabeledField>
            <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4 md:col-span-2"><label className="flex h-9 items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} className="cursor-pointer" /> Active</label><Button type="submit" disabled={saving} className="ml-auto cursor-pointer bg-red-700 text-white hover:bg-red-800">{saving ? <Spinner /> : <UserPlusIcon />}Create</Button></div>
          </form>
        </section>

        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p> : null}
        {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</p> : null}

        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-neutral-50 px-5 py-4"><div className="flex items-center gap-2"><UsersRoundIcon className="size-5 text-red-700" /><h2 className="text-lg font-semibold">Users</h2></div><Badge variant="outline" className="bg-white">{users.length} users</Badge></div>
          <div className="border-b border-neutral-200 p-4">
            <div className="relative max-w-md">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, email, or role" className="pl-9" />
            </div>
          </div>
          {loading ? <div className="flex items-center gap-3 p-6 text-sm text-neutral-500"><Spinner className="size-5 text-red-700" />Loading users...</div> : null}
          {!loading && users.length === 0 ? <p className="p-6 text-sm text-neutral-500">No users found.</p> : null}
          {!loading && users.length > 0 && filteredUsers.length === 0 ? <p className="p-6 text-sm text-neutral-500">No users match your search.</p> : null}
          {filteredUsers.length > 0 ? <div className="hidden grid-cols-[minmax(170px,1fr)_minmax(240px,1.4fr)_minmax(180px,1fr)_110px_80px] gap-4 border-b bg-neutral-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 md:grid"><span>Name</span><span>Email</span><span>Role</span><span>Status</span><span className="text-right">Action</span></div> : null}
          <div className="grid grid-cols-1 gap-3 p-4 min-[520px]:grid-cols-2 md:block md:divide-y md:p-0">{filteredUsers.map((user) => <ManagedUserRow key={user.userId} user={user} currentUser={user.userId === currentUserId} editing={editingUserId === user.userId} onEdit={() => setEditingUserId(user.userId)} onCancel={() => setEditingUserId(null)} onSaved={(updated) => { setUsers((current) => current.map((item) => item.userId === updated.userId ? updated : item)); setEditingUserId(null); }} />)}</div>
        </section>
      </div>
    </ReportShell>
  );
}

function ManagedUserRow({ user, currentUser, editing, onEdit, onCancel, onSaved }: { user: ManagedUser; currentUser: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: (user: ManagedUser) => void }) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [role, setRole] = useState<AuthRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName, role, isActive, password }) });
      const payload = (await response.json()) as { user?: ManagedUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error ?? "Unable to update user.");
      setPassword(""); onSaved(payload.user);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update user."); }
    finally { setSaving(false); }
  }
  return <div className={`min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm md:rounded-none md:border-0 md:shadow-none ${editing ? "min-[520px]:col-span-2" : ""}`}>
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(170px,1fr)_minmax(240px,1.4fr)_minmax(180px,1fr)_110px_80px] md:items-center md:gap-4">
      <div><span className="mb-1 block text-xs font-semibold uppercase text-neutral-400 md:hidden">Name</span><div className="flex items-center gap-2 font-medium">{user.fullName || "Unnamed user"}{currentUser ? <Badge className="shrink-0 bg-red-700 text-white">You</Badge> : null}</div></div>
      <div className="min-w-0"><span className="mb-1 block text-xs font-semibold uppercase text-neutral-400 md:hidden">Email</span><p className="truncate text-sm text-neutral-600" title={user.email}>{user.email}</p></div>
      <div><span className="mb-1 block text-xs font-semibold uppercase text-neutral-400 md:hidden">Role</span><Badge variant="outline" className="bg-neutral-50 font-medium">{AUTH_ROLE_LABELS[user.role]}</Badge></div>
      <div><span className="mb-1 block text-xs font-semibold uppercase text-neutral-400 md:hidden">Status</span><span className={`inline-flex items-center gap-2 text-sm font-medium ${user.isActive ? "text-emerald-700" : "text-neutral-500"}`}><span className={`size-2 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-neutral-400"}`} />{user.isActive ? "Active" : "Inactive"}</span></div>
      <div className="md:text-right"><Button type="button" variant="outline" size="sm" onClick={editing ? onCancel : onEdit} className="cursor-pointer">{editing ? <XIcon /> : <PencilIcon />}{editing ? "Close" : "Edit"}</Button></div>
    </div>
    {editing ? <div className="border-t border-neutral-200 bg-neutral-50/70 p-5 sm:p-6">
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 md:items-end">
        <LabeledField label="Full name"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} /></LabeledField>
        <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Email</p><div className="flex min-h-9 items-center rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium">{user.email}</div></div>
        <LabeledField label="Role"><RoleSelect value={role} onChange={setRole} disabled={currentUser} /></LabeledField>
        <LabeledField label="New password"><Input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave unchanged" /></LabeledField>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 pt-4 md:col-span-2"><label className="flex items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} disabled={currentUser} className="cursor-pointer" />Active</label><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel} className="cursor-pointer">Cancel</Button><Button type="button" variant="outline" size="sm" onClick={() => void save()} disabled={saving} className="cursor-pointer">{saving ? <Spinner /> : <SaveIcon />}Save changes</Button></div></div>
        {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
      </div>
    </div> : null}
  </div>;
}

function RoleSelect({ value, onChange, disabled = false }: { value: AuthRole; onChange: (role: AuthRole) => void; disabled?: boolean }) {
  return <Select value={value} onValueChange={(next) => onChange(next as AuthRole)} disabled={disabled}><SelectTrigger className="w-full cursor-pointer"><SelectValue /></SelectTrigger><SelectContent>{AUTH_ROLES.map((item) => <SelectItem key={item} value={item}>{AUTH_ROLE_LABELS[item]} ({item})</SelectItem>)}</SelectContent></Select>;
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>{children}</label>;
}
