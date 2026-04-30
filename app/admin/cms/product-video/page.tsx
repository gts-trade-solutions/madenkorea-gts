'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// DB row type
type Row = {
  id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  page_scope: string;
  position: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  video_path: string | null;
  video_url: string | null;         // stored public URL (convenience)
  thumbnail_path: string | null;
  thumbnail_url: string | null;     // stored public URL (convenience)
  created_at: string;
  updated_at: string;
};

type Mode = 'create' | 'edit';

export default function AdminProductVideosPage() {
  // list state
  const [scope, setScope] = useState('home');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // modal + form
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pageScope, setPageScope] = useState('home');
  const [position, setPosition] = useState(10);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [productSlug, setProductSlug] = useState(''); // resolve to product_id on save

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  const [msg, setMsg] = useState('');

  const toPublicUrl = (bucket: string, path?: string | null) =>
    path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` : undefined;

  const isoToLocal = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const localToIso = (v?: string) => (v ? new Date(v).toISOString() : null);

  async function fetchList() {
    setLoading(true);
    const { data, error } = await supabase
      .from('home_product_videos')
      .select('id, product_id, title, description, page_scope, position, active, starts_at, ends_at, video_path, video_url, thumbnail_path, thumbnail_url, created_at, updated_at')
      .eq('page_scope', scope)
      .order('position', { ascending: true });

    if (error) alert(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function resetForm() {
    setTitle('');
    setDescription('');
    setPageScope(scope);
    setPosition(rows.length ? (rows[rows.length - 1]?.position ?? 0) + 10 : 10);
    setActive(true);
    setStartsAt('');
    setEndsAt('');
    setProductSlug('');
    setVideoFile(null);
    setThumbFile(null);
    setMsg('');
  }

  function openCreate() {
    setMode('create');
    setEditingId(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(r: Row) {
    setMode('edit');
    setEditingId(r.id);
    setTitle(r.title);
    setDescription(r.description ?? '');
    setPageScope(r.page_scope);
    setPosition(r.position);
    setActive(r.active);
    setStartsAt(isoToLocal(r.starts_at));
    setEndsAt(isoToLocal(r.ends_at));
    setProductSlug(''); // optional: user can enter to change
    setVideoFile(null);
    setThumbFile(null);
    setMsg('');
    setOpen(true);
  }

  function safeExt(name: string, fallback: string) {
    const raw = (name.split('.').pop() || fallback).toLowerCase();
    return raw.replace(/[^a-z0-9]/g, '') || fallback;
  }

  async function uploadTo(bucket: string, path: string, file: File, contentType?: string) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: contentType || file.type || undefined });
    if (error) throw new Error(error.message);
    return toPublicUrl(bucket, path)!;
  }

  async function resolveProductIdBySlug(slug: string) {
    if (!slug.trim()) return null;
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('slug', slug.trim())
      .limit(1)
      .single();
    if (error) throw new Error(`Product not found for slug "${slug}"`);
    return (data as { id: string }).id;
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this video card?')) return;
    const { error } = await supabase.from('home_product_videos').delete().eq('id', id);
    if (error) return alert(error.message);
    await fetchList();
  }

  async function handleToggle(r: Row) {
    const { error } = await supabase.from('home_product_videos').update({ active: !r.active }).eq('id', r.id);
    if (error) return alert(error.message);
    await fetchList();
  }

  async function swapPositions(a: Row, b: Row) {
    const temp = -Math.floor(Date.now() / 1000);
    const q1 = supabase.from('home_product_videos').update({ position: temp }).eq('id', a.id);
    const q2 = supabase.from('home_product_videos').update({ position: a.position }).eq('id', b.id);
    const q3 = supabase.from('home_product_videos').update({ position: b.position }).eq('id', a.id);
    const [r1, r2, r3] = await Promise.all([q1, q2, q3]);
    if (r1.error || r2.error || r3.error) {
      throw new Error(r1.error?.message || r2.error?.message || r3.error?.message);
    }
  }

  async function move(id: string, dir: 'up' | 'down') {
    const idx = rows.findIndex((x) => x.id === id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    try {
      await swapPositions(rows[idx], rows[swapIdx]);
      await fetchList();
    } catch (e: any) {
      alert(e?.message || 'Reorder failed');
    }
  }

  async function save() {
    try {
      setMsg('');
      if (!title.trim()) throw new Error('Title is required.');
      if (mode === 'create' && !videoFile) throw new Error('Please select a video file.');

      // Optional: resolve product id from slug if provided
      let productId: string | null = null;
      if (productSlug.trim()) {
        productId = await resolveProductIdBySlug(productSlug.trim());
      }

      const BUCKET = 'product-media';

      if (mode === 'create') {
        // pre-generate id so we can upload first
        const id = (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2);

        // 1) upload required video
        let videoPath: string | null = null;
        let videoUrl: string | null = null;
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, 'mp4');
          videoPath = `product-videos/${id}/video.${vidExt}`;
          videoUrl = await uploadTo(BUCKET, videoPath, videoFile, 'video/mp4');
        }

        // 2) upload optional thumbnail
        let thumbPath: string | null = null;
        let thumbUrl: string | null = null;
        if (thumbFile) {
          const imgExt = safeExt(thumbFile.name, 'jpg');
          thumbPath = `product-videos/${id}/thumb.${imgExt}`;
          thumbUrl = await uploadTo(BUCKET, thumbPath, thumbFile);
        }

        // 3) insert
        const { error } = await supabase.from('home_product_videos').insert({
          id,
          product_id: productId,
          title,
          description: description || null,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
          video_path: videoPath,
          video_url: videoUrl,
          thumbnail_path: thumbPath,
          thumbnail_url: thumbUrl,
        });
        if (error) throw new Error(error.message);

      } else {
        if (!editingId) throw new Error('Missing id');
        // 1) update base fields
        const base: any = {
          title,
          description: description || null,
          page_scope: pageScope,
          position,
          active,
          starts_at: localToIso(startsAt),
          ends_at: localToIso(endsAt),
        };
        if (productSlug.trim()) {
          base.product_id = productId;
        }
        const { error } = await supabase.from('home_product_videos').update(base).eq('id', editingId);
        if (error) throw new Error(error.message);

        // 2) uploads patch
        const patch: any = {};
        if (videoFile) {
          const vidExt = safeExt(videoFile.name, 'mp4');
          const videoPath = `product-videos/${editingId}/video.${vidExt}`;
          const videoUrl = await uploadTo(BUCKET, videoPath, videoFile, 'video/mp4');
          patch.video_path = videoPath;
          patch.video_url = videoUrl;
        }
        if (thumbFile) {
          const imgExt = safeExt(thumbFile.name, 'jpg');
          const thumbPath = `product-videos/${editingId}/thumb.${imgExt}`;
          const thumbUrl = await uploadTo(BUCKET, thumbPath, thumbFile);
          patch.thumbnail_path = thumbPath;
          patch.thumbnail_url = thumbUrl;
        }
        if (Object.keys(patch).length) {
          const { error: e2 } = await supabase.from('home_product_videos').update(patch).eq('id', editingId);
          if (e2) throw new Error(e2.message);
        }
      }

      setOpen(false);
      await fetchList();
    } catch (err: any) {
      setMsg(err.message || 'Save failed');
    }
  }

  const list = useMemo(() => rows, [rows]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Product Video Carousel</h1>
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
            + Add Video
          </button>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Preview</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Scope</th>
              <th className="text-left px-3 py-2">Position</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && list.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No videos yet.</td></tr>
            )}
            {list.map((r, i) => {
              const thumb = r.thumbnail_url ?? toPublicUrl('product-media', r.thumbnail_path);
              const vid = r.video_url ?? toPublicUrl('product-media', r.video_path);
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="w-36 h-16 bg-gray-100 rounded overflow-hidden">
                      {thumb ? (
                        <img src={thumb} alt={r.title} className="w-full h-full object-cover" />
                      ) : vid ? (
                        <video src={vid} muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs text-gray-400">no media</div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.page_scope}</td>
                  <td className="px-3 py-2">{r.position}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`px-2 py-1 rounded text-xs ${r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {r.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => i > 0 && move(r.id, 'up')}
                        className="px-2 py-1 rounded border hover:bg-gray-50"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => i < list.length - 1 && move(r.id, 'down')}
                        className="px-2 py-1 rounded border hover:bg-gray-50"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button onClick={() => openEdit(r)} className="px-3 py-1 rounded border hover:bg-gray-50">
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
                <div className="text-lg font-semibold">{mode === 'create' ? 'Add Video' : 'Edit Video'}</div>
                <div className="text-xs text-gray-500">Upload a video (required) and an optional thumbnail.</div>
              </div>
              <button className="text-gray-500 hover:text-black" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="grid gap-3">
              <label className="text-sm">
                Title
                <input className="mt-1 w-full border rounded px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="text-sm">
                Description (optional)
                <textarea className="mt-1 w-full border rounded px-2 py-1 min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Page scope
                  <select className="mt-1 w-full border rounded px-2 py-1" value={pageScope} onChange={(e) => setPageScope(e.target.value)}>
                    <option value="home">home</option>
                  </select>
                </label>
                <label className="text-sm">
                  Position
                  <input type="number" className="mt-1 w-full border rounded px-2 py-1" value={position} onChange={(e) => setPosition(Number(e.target.value) || 0)} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Starts at (optional)
                  <input type="datetime-local" className="mt-1 w-full border rounded px-2 py-1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </label>
                <label className="text-sm">
                  Ends at (optional)
                  <input type="datetime-local" className="mt-1 w-full border rounded px-2 py-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </label>
              </div>

              <label className="text-sm">
                Link to product (slug) — optional
                <input className="mt-1 w-full border rounded px-2 py-1" value={productSlug} onChange={(e) => setProductSlug(e.target.value)} placeholder="e.g. skintectonic-spf-50" />
              </label>

              <label className="text-sm">
                Video (required on create)
                <input type="file" accept="video/*" className="mt-1 block w-full" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                <span className="text-xs text-gray-500">Saved to <code>product-media/product-videos/&lt;id&gt;/video.&lt;ext&gt;</code></span>
              </label>

              <label className="text-sm">
                Thumbnail (optional)
                <input type="file" accept="image/*" className="mt-1 block w-full" onChange={(e) => setThumbFile(e.target.files?.[0] || null)} />
                <span className="text-xs text-gray-500">Saved to <code>product-media/product-videos/&lt;id&gt;/thumb.&lt;ext&gt;</code></span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>

              {msg && <div className="text-sm text-red-600">{msg}</div>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => setOpen(false)}>Cancel</button>
              <button onClick={save} className="px-3 py-2 rounded bg-black text-white hover:opacity-90">
                {mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
