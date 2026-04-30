'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  LogOut,
  Search,
  Check,
  X,
  Eye,
  RefreshCw,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit3,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

type IRStatus = 'pending' | 'approved' | 'rejected';
type IR = {
  id: string;
  user_id: string;
  handle: string | null;
  note: string | null;
  social?: any;
  status: IRStatus;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'customer' | 'admin';
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  email?: string | null; // reserved if you later join email in a view
};

type PayoutRow = {
  id: string;
  influencer_id: string;
  amount: number;
  currency?: string | null;
  status: 'initiated' | 'processing' | 'paid' | 'failed' | 'canceled';
  notes?: string | null;
  covering_orders?: string[] | null;
  created_at: string;
  paid_at?: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export default function AdminInfluencersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // --- Tab handling ---
  const [tab, setTab] = useState<'requests' | 'payouts'>('requests');

  // === Requests state ===
  const [search, setSearch] = useState('');
  const [filter, setFilter] =
    useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const [rows, setRows] = useState<IR[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // View modal state
  const [viewing, setViewing] = useState<{
    request: IR;
    profile?: Profile;
  } | null>(null);

  // === Payouts state ===
  const [pSearch, setPSearch] = useState('');
  const [pFilter, setPFilter] =
    useState<'all' | 'initiated' | 'processing' | 'paid' | 'failed' | 'canceled'>(
      'initiated'
    );
  const [pLoading, setPLoading] = useState(true);
  const [pRefreshKey, setPRefreshKey] = useState(0);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [influencerMap, setInfluencerMap] = useState<
    Record<string, { name: string; handle?: string | null }>
  >({});
  const [noteEditing, setNoteEditing] = useState<{ id: string; note: string } | null>(
    null
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // gate: must be admin
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/admin');
        return;
      }
      const { data: adminFlag, error } = await supabase.rpc('is_admin');
      if (error) {
        toast.error(error.message);
        router.replace('/admin');
        return;
      }
      if (!adminFlag) {
        router.replace('/admin');
        return;
      }
      if (cancelled) return;
      setIsAdmin(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ====== LOAD: Influencer requests ======
  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      setLoading(true);

      const { data: ir, error: irErr } = await supabase
        .from('influencer_requests')
        .select('id, user_id, handle, note, social, status, created_at')
        .order('created_at', { ascending: false });

      if (irErr) {
        setLoading(false);
        toast.error(irErr.message);
        return;
      }

      const reqs = ir ?? [];
      setRows(reqs);

      const ids = Array.from(new Set(reqs.map((r) => r.user_id)));
      if (ids.length) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          // pull more profile fields so the modal can show richer info
          .select('id, full_name, role, phone, avatar_url, created_at')
          .in('id', ids);

        if (profErr) {
          setLoading(false);
          toast.error(profErr.message);
          return;
        }

        const map: Record<string, Profile> = {};
        (profs ?? []).forEach((p) => {
          map[p.id as string] = p as Profile;
        });
        setProfiles(map);
      } else {
        setProfiles({});
      }

      setLoading(false);
    })();
  }, [ready, isAdmin, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      const p = profiles[r.user_id];
      return (
        (r.handle || '').toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q) ||
        (p?.full_name || '').toLowerCase().includes(q) ||
        (r.user_id || '').toLowerCase().includes(q)
      );
    });
  }, [rows, profiles, search, filter]);

  const getReqBadge = (s: IRStatus) => {
    switch (s) {
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'pending':
        return (
          <Badge variant="outline" className="text-amber-600">
            Pending
          </Badge>
        );
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/');
  };

  const setStatus = async (row: IR, status: IRStatus) => {
    if (status === 'approved') {
      const { error } = await supabase.rpc('approve_influencer', {
        p_request_id: row.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Approved and profile created');
      setRefreshKey((k) => k + 1);
      return;
    }
    if (status === 'rejected') {
      const { error } = await supabase.rpc('reject_influencer', {
        p_request_id: row.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Marked as rejected');
      setRefreshKey((k) => k + 1);
      return;
    }
  };

  // ====== LOAD: Payouts ======
  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      setPLoading(true);
      // 1) Fetch payouts
      const { data, error } = await supabase
        .from('influencer_payouts')
        .select(
          'id, influencer_id, amount, currency, status, notes, created_at, paid_at, covering_orders'
        )
        .order('created_at', { ascending: false });
      if (error) {
        setPLoading(false);
        toast.error(error.message);
        return;
      }
      const rows = (data ?? []) as PayoutRow[];
      setPayouts(rows);

      // 2) Hydrate influencer name/handle
      const ids = Array.from(new Set(rows.map((r) => r.influencer_id)));
      const map: Record<string, { name: string; handle?: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        (profs ?? []).forEach((p: any) => {
          map[p.id] = { name: p.full_name || '—' };
        });

        const { data: infls } = await supabase
          .from('influencer_profiles')
          .select('user_id, handle')
          .in('user_id', ids);
        (infls ?? []).forEach((ip: any) => {
          map[ip.user_id] = { ...(map[ip.user_id] || { name: '—' }), handle: ip.handle };
        });
      }
      setInfluencerMap(map);
      setPLoading(false);
    })();
  }, [ready, isAdmin, pRefreshKey]);

  const payoutFiltered = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    return payouts.filter((r) => {
      if (pFilter !== 'all' && r.status !== pFilter) return false;
      if (!q) return true;
      const who = influencerMap[r.influencer_id];
      const inString = `${who?.name || ''} ${who?.handle || ''} ${r.id} ${
        r.influencer_id
      } ${r.notes || ''}`.toLowerCase();
      return inString.includes(q);
    });
  }, [payouts, pFilter, pSearch, influencerMap]);

  const payoutBadge = (s: PayoutRow['status']) => {
    switch (s) {
      case 'initiated':
        return (
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200">
            Pending
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-sky-50 text-sky-700 border border-sky-200">
            Processing
          </Badge>
        );
      case 'paid':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
            Settled
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  };

  // --- actions: payout status ---
  async function setPayoutStatus(row: PayoutRow, status: PayoutRow['status']) {
    try {
      setUpdatingId(row.id);
      const patch: any = { status };
      if (status === 'paid') patch.paid_at = new Date().toISOString();
      if (status !== 'paid') patch.paid_at = null;

      const { error } = await supabase
        .from('influencer_payouts')
        .update(patch)
        .eq('id', row.id);
      if (error) throw error;
      toast.success(`Payout marked as ${status}`);
      setPRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update payout');
    } finally {
      setUpdatingId(null);
    }
  }

  async function savePayoutNote(id: string, note: string) {
    try {
      setUpdatingId(id);
      const { error } = await supabase
        .from('influencer_payouts')
        .update({ notes: note })
        .eq('id', id);
      if (error) throw error;
      toast.success('Note saved');
      setNoteEditing(null);
      setPRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save note');
    } finally {
      setUpdatingId(null);
    }
  }

  if (!ready || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Influencer Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant={tab === 'requests' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTab('requests');
                setViewing(null);
              }}
            >
              Requests
            </Button>
            <Button
              variant={tab === 'payouts' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTab('payouts');
                setViewing(null);
              }}
            >
              Payouts
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (tab === 'requests') setRefreshKey((k) => k + 1);
                else setPRefreshKey((k) => k + 1);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        {/* ===================== TAB: REQUESTS ===================== */}
        {tab === 'requests' && (
          <Card>
            <CardHeader>
              <CardTitle>Influencer requests</CardTitle>
              <CardDescription>
                Review applications and manage approved creators
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Controls */}
              <div className="mb-4 flex flex-col md:flex-row gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search handle, name, note, user id…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={filter === 'pending' ? 'default' : 'outline'}
                    onClick={() => setFilter('pending')}
                  >
                    Pending
                  </Button>
                  <Button
                    variant={filter === 'approved' ? 'default' : 'outline'}
                    onClick={() => setFilter('approved')}
                  >
                    Approved
                  </Button>
                  <Button
                    variant={filter === 'rejected' ? 'default' : 'outline'}
                    onClick={() => setFilter('rejected')}
                  >
                    Rejected
                  </Button>
                  <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </Button>
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Handle</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-[220px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-10 text-center text-muted-foreground"
                        >
                          {loading ? 'Loading…' : 'No requests found'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((r) => {
                        const p = profiles[r.user_id];
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              <div>{p?.full_name || '—'}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.user_id.slice(0, 8)}…{r.user_id.slice(-4)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{r.handle || '—'}</div>
                              {r.note && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {r.note}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {new Date(r.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>{getReqBadge(r.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setViewing({
                                      request: r,
                                      profile: profiles[r.user_id],
                                    })
                                  }
                                >
                                  <Eye className="h-4 w-4 mr-1" /> View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={r.status === 'approved'}
                                  onClick={() => setStatus(r, 'approved')}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={r.status === 'rejected'}
                                  onClick={() => setStatus(r, 'rejected')}
                                >
                                  <X className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===================== TAB: PAYOUTS ===================== */}
        {tab === 'payouts' && (
          <Card>
            <CardHeader>
              <CardTitle>Payout requests</CardTitle>
              <CardDescription>
                Approve and settle influencer withdrawals
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Controls */}
              <div className="mb-4 flex flex-col md:flex-row gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, handle, payout id, user id, note…"
                    value={pSearch}
                    onChange={(e) => setPSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    ['initiated', 'processing', 'paid', 'failed', 'canceled', 'all'] as const
                  ).map((s) => (
                    <Button
                      key={s}
                      variant={pFilter === s ? 'default' : 'outline'}
                      onClick={() => setPFilter(s)}
                      className="capitalize"
                    >
                      {s === 'initiated' ? 'Pending' : s}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Influencer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="min-w-[320px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : payoutFiltered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No items
                        </TableCell>
                      </TableRow>
                    ) : (
                      payoutFiltered.map((r) => {
                        const who = influencerMap[r.influencer_id];
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div>{who?.name || '—'}</div>
                                  <div className="text-xs text-muted-foreground">
                                    @{who?.handle || '—'} •{' '}
                                    {r.influencer_id.slice(0, 6)}…
                                    {r.influencer_id.slice(-4)}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="font-semibold">
                                {toINR(r.amount, r.currency)}
                              </div>
                              {r.covering_orders && r.covering_orders.length > 0 && (
                                <div className="text-[11px] text-muted-foreground">
                                  orders: {r.covering_orders.length}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div>{new Date(r.created_at).toLocaleString()}</div>
                              {r.status === 'paid' && r.paid_at && (
                                <div className="text-xs text-emerald-700">
                                  Paid {new Date(r.paid_at).toLocaleString()}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{payoutBadge(r.status)}</TableCell>
                            <TableCell className="max-w-[280px]">
                              {noteEditing?.id === r.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={noteEditing.note}
                                    onChange={(e) =>
                                      setNoteEditing({ id: r.id, note: e.target.value })
                                    }
                                    placeholder="Internal note / reference"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => savePayoutNote(r.id, noteEditing.note)}
                                    disabled={updatingId === r.id}
                                  >
                                    {updatingId === r.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setNoteEditing(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="truncate text-sm">
                                    {r.notes || (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() =>
                                      setNoteEditing({ id: r.id, note: r.notes || '' })
                                    }
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    updatingId === r.id ||
                                    r.status === 'processing' ||
                                    r.status === 'paid'
                                  }
                                  onClick={() => setPayoutStatus(r, 'processing')}
                                >
                                  {updatingId === r.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <AlertCircle className="mr-2 h-4 w-4" />
                                  )}{' '}
                                  Processing
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={updatingId === r.id || r.status === 'paid'}
                                  onClick={() => setPayoutStatus(r, 'paid')}
                                >
                                  {updatingId === r.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                  )}{' '}
                                  Mark paid
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={updatingId === r.id || r.status === 'paid'}
                                  onClick={() => setPayoutStatus(r, 'failed')}
                                >
                                  <X className="mr-2 h-4 w-4" /> Fail
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===================== VIEW MODAL ===================== */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="relative w-full max-w-md rounded-lg border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">
                    {viewing.profile?.full_name ||
                      viewing.request.handle ||
                      'Unknown user'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {viewing.request.user_id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getReqBadge(viewing.request.status)}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewing(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Full name</p>
                  <p className="font-medium">
                    {viewing.profile?.full_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Role</p>
                  <p className="font-medium">
                    {viewing.profile?.role || '—'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Phone</p>
                  <p className="font-medium">
                    {viewing.profile?.phone || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Profile created
                  </p>
                  <p className="font-medium">
                    {viewing.profile?.created_at
                      ? new Date(viewing.profile.created_at).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Handle</p>
                <p className="font-medium">{viewing.request.handle || '—'}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Note</p>
                <p className="whitespace-pre-wrap">
                  {viewing.request.note || '—'}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Request created
                </p>
                <p className="font-medium">
                  {new Date(viewing.request.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Helpers ---------- */
function toINR(n: number, currency?: string | null) {
  const code = (currency || 'INR').toUpperCase();
  try {
    return n.toLocaleString('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${code === 'INR' ? '₹' : code + ' '}${Math.round(n)}`;
  }
}
