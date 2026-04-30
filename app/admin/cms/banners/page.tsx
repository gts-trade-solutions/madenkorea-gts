"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Row = {
  id: string;
  alt: string;
  image_path: string | null;
  video_url: string | null; // stores PUBLIC url of uploaded video
  link_url: string | null;
  page_scope: string;
  position: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type Mode = "create" | "edit";

export default function BannersAdminPage() {
  const [banners, setBanners] = useState<Row[]>([]);
  const [scope, setScope] = useState("home");
  const [loading, setLoading] = useState(false);

  // modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [alt, setAlt] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pageScope, setPageScope] = useState("home");
  const [position, setPosition] = useState(10);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string>("");

  const toPublicUrl = (path?: string | null) =>
    path
      ? supabase.storage.from("site-assets").getPublicUrl(path).data.publicUrl
      : undefined;

  const isoToLocal = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
  };
  const localToIso = (v?: string) => (v ? new Date(v).toISOString() : null);

  async function fetchList() {
    setLoading(true);
    const { data, error } = await supabase
      .from("home_banners")
      .select(
        "id, alt, image_path, video_url, link_url, page_scope, position, active, starts_at, ends_at, created_at, updated_at"
      )
      .eq("page_scope", scope)
      .order("position", { ascending: true });

    if (error) alert(error.message);
    setBanners((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function resetForm() {
    setAlt("");
    setLinkUrl("");
    setPageScope(scope);
    setPosition(
      banners.length ? (banners[banners.length - 1]?.position ?? 0) + 10 : 10
    );
    setActive(true);
    setStartsAt("");
    setEndsAt("");
    setImageFile(null);
    setVideoFile(null);
    setMsg("");
  }

  function openCreate() {
    setMode("create");
    setEditingId(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(r: Row) {
    setMode("edit");
    setEditingId(r.id);
    setAlt(r.alt);
    setLinkUrl(r.link_url ?? "");
    setPageScope(r.page_scope);
    setPosition(r.position);
    setActive(r.active);
    setStartsAt(isoToLocal(r.starts_at));
    setEndsAt(isoToLocal(r.ends_at));
    setImageFile(null);
    setVideoFile(null);
    setMsg("");
    setOpen(true);
  }

  function safeExt(name: string, fallback: string) {
    const raw = (name.split(".").pop() || fallback).toLowerCase();
    return raw.replace(/[^a-z0-9]/g, "") || fallback;
  }

  async function upload(path: string, file: File, contentType?: string) {
    const { error } = await supabase.storage
      .from("site-assets")
      .upload(path, file, {
        upsert: true,
        contentType: contentType || file.type || undefined,
      });
    if (error) throw new Error(error.message);
    return supabase.storage.from("site-assets").getPublicUrl(path).data
      .publicUrl;
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this banner?")) return;
    const { error } = await supabase.from("home_banners").delete().eq("id", id);
    if (error) return alert(error.message);
    await fetchList();
  }

  async function handleToggle(r: Row) {
    const { error } = await supabase
      .from("home_banners")
      .update({ active: !r.active })
      .eq("id", r.id);
    if (error) return alert(error.message);
    await fetchList();
  }

  // Create or Save (works even if image_path NOT NULL — we upload first)
  async function save() {
    try {
      setMsg("");
      if (!alt.trim()) throw new Error("Alt is required.");

      const trimmedLink = linkUrl.trim();
      if (
        trimmedLink &&
        !/^https?:\/\//i.test(trimmedLink) &&
        !trimmedLink.startsWith("/")
      ) {
        throw new Error(
          "Link URL must start with http://, https://, or / (for an internal route)."
        );
      }
      const linkValue = trimmedLink || null;

      if (mode === "create") {
        // If your DB keeps image_path NOT NULL, require image
        if (!imageFile) throw new Error("Please select an image.");

        // Pre-generate id for storage paths
        const id =
          (globalThis.crypto as any)?.randomUUID?.() ||
          Math.random().toString(36).slice(2);

        // Upload image first (required)
        const imgExt = safeExt(imageFile.name, "jpg");
        const imagePath = `banners/${id}/image.${imgExt}`;
        await upload(imagePath, imageFile);

        // Upload optional video and get a PUBLIC url
        let videoUrl: string | null = null;
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, "mp4");
          const videoPath = `banners/${id}/video.${vidExt}`;
          videoUrl = await upload(videoPath, videoFile, "video/mp4");
        }

        // Insert with image_path present (and optional video_url)
        const { error } = await supabase.from("home_banners").insert({
          id,
          alt,
          link_url: linkValue,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
          image_path: imagePath,
          video_url: videoUrl,
        });
        if (error) throw new Error(error.message);
      } else {
        // EDIT
        if (!editingId) throw new Error("Missing banner id");

        // Update base fields
        const base: any = {
          alt,
          link_url: linkValue,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
        };
        const { error } = await supabase
          .from("home_banners")
          .update(base)
          .eq("id", editingId);
        if (error) throw new Error(error.message);

        // Upload/patch media if chosen
        const updates: any = {};
        if (imageFile) {
          const imgExt = safeExt(imageFile.name, "jpg");
          const imagePath = `banners/${editingId}/image.${imgExt}`;
          await upload(imagePath, imageFile);
          updates.image_path = imagePath; // store STORAGE path
        }
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, "mp4");
          const videoPath = `banners/${editingId}/video.${vidExt}`;
          const vUrl = await upload(videoPath, videoFile, "video/mp4");
          updates.video_url = vUrl; // store PUBLIC URL
        }
        if (Object.keys(updates).length) {
          const { error: e2 } = await supabase
            .from("home_banners")
            .update(updates)
            .eq("id", editingId);
          if (e2) throw new Error(e2.message);
        }
      }

      setOpen(false);
      await fetchList();
    } catch (err: any) {
      setMsg(err.message || "Save failed");
    }
  }

  const list = useMemo(() => banners, [banners]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Banner Management</h1>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="home">home</option>
          </select>
          <button
            onClick={openCreate}
            className="rounded bg-black text-white px-3 py-2 hover:opacity-90"
          >
            + Add Banner
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Preview</th>
              <th className="text-left px-3 py-2">Alt</th>
              <th className="text-left px-3 py-2">Scope</th>
              <th className="text-left px-3 py-2">Position</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No banners yet.
                </td>
              </tr>
            )}
            {list.map((r) => {
              const img = toPublicUrl(r.image_path);
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="w-36 h-16 bg-gray-100 rounded overflow-hidden">
                      {r.video_url ? (
                        <video
                          src={r.video_url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : img ? (
                        <img
                          src={img}
                          alt={r.alt}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs text-gray-400">
                          no media
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.alt}</td>
                  <td className="px-3 py-2">{r.page_scope}</td>
                  <td className="px-3 py-2">{r.position}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`px-2 py-1 rounded text-xs ${
                        r.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => openEdit(r)}
                        className="px-3 py-1 rounded border hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-3 py-1 rounded border hover:bg-red-50 text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">
                  {mode === "create" ? "Add Banner" : "Edit Banner"}
                </div>
                <div className="text-xs text-gray-500">
                  Choose image/video and set details.
                </div>
              </div>
              <button
                className="text-gray-500 hover:text-black"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3">
              <label className="text-sm">
                Alt
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
              </label>

              <label className="text-sm">
                Link URL (optional)
                <input
                  type="url"
                  className="mt-1 w-full border rounded px-2 py-1"
                  placeholder="/products/some-slug or https://example.com/…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <span className="text-xs text-gray-500">
                  Where the banner sends users when clicked. Leave blank to make
                  it non-clickable. Use a path like{" "}
                  <code>/products/&lt;slug&gt;</code> for internal routes.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Page scope
                  <select
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={pageScope}
                    onChange={(e) => setPageScope(e.target.value)}
                  >
                    <option value="home">home</option>
                  </select>
                </label>
                <label className="text-sm">
                  Position
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={position}
                    onChange={(e) => setPosition(Number(e.target.value) || 0)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Starts at (optional)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Ends at (optional)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded px-2 py-1"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
              </div>

              <label className="text-sm">
                Image (required on create if your DB has NOT NULL)
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
                <span className="text-xs text-gray-500">
                  Stored at{" "}
                  <code>site-assets/banners/&lt;id&gt;/image.&lt;ext&gt;</code>
                </span>
              </label>

              <label className="text-sm">
                Video (optional)
                <input
                  type="file"
                  accept="video/*"
                  className="mt-1 block w-full"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
                <span className="text-xs text-gray-500">
                  We save its <em>public</em> URL to <code>video_url</code>.
                </span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active
              </label>

              {msg && <div className="text-sm text-red-600">{msg}</div>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded border hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                onClick={save} // never disabled; we validate with messages
                className="px-3 py-2 rounded bg-black text-white hover:opacity-90"
              >
                {mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
