'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LogOut, Search, Eye } from 'lucide-react';
import { toast } from 'sonner';

type Vendor = {
  id: string;
  display_name: string;
  legal_name: string | null;
  slug: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  status: 'pending'|'approved'|'rejected'|'disabled';
  commission_rate: number;
  created_at: string;
  approved_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export default function AdminVendorsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/admin'); return; }
      const { data: adminFlag } = await supabase.rpc('is_admin');
      if (!adminFlag) { router.replace('/admin'); return; }
      if (cancelled) return;
      setIsAdmin(true);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendors')
        .select('id, display_name, legal_name, slug, email, phone, gstin, status, commission_rate, created_at, approved_at')
        .order('created_at', { ascending: false });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      setRows(data ?? []);
    })();
  }, [ready, isAdmin, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(v =>
      (v.display_name || '').toLowerCase().includes(q) ||
      (v.legal_name || '').toLowerCase().includes(q) ||
      (v.email || '').toLowerCase().includes(q) ||
      (v.phone || '').toLowerCase().includes(q) ||
      (v.gstin || '').toLowerCase().includes(q) ||
      (v.slug || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const getStatusBadge = (status: Vendor['status']) => {
    switch (status) {
      case 'approved': return <Badge variant="default">Approved</Badge>;
      case 'pending':  return <Badge variant="outline" className="text-amber-600">Pending</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      case 'disabled': return <Badge variant="secondary">Disabled</Badge>;
      default:         return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/');
  };

  if (!ready || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>← Back</Button>
            <h1 className="text-2xl font-bold">Vendor Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Vendors</CardTitle>
            <CardDescription>Review applications and manage accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                <Input placeholder="Search name, email, phone, GSTIN, slug…" value={search} onChange={(e)=>setSearch(e.target.value)} className="pl-10"/>
              </div>
              <Button variant="outline" onClick={()=>setRefreshKey(k=>k+1)}>Refresh</Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        {loading ? 'Loading…' : 'No vendors found'}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        <div>{v.display_name}</div>
                        <div className="text-xs text-muted-foreground">{v.slug || '—'}</div>
                      </TableCell>
                      <TableCell>{v.email || '—'}</TableCell>
                      <TableCell>{v.phone || '—'}</TableCell>
                      <TableCell>{v.gstin || '—'}</TableCell>
                      <TableCell>{v.commission_rate?.toFixed(2)}%</TableCell>
                      <TableCell>{getStatusBadge(v.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={()=>router.push(`/admin/vendors/${v.id}`)}>
                          <Eye className="h-4 w-4"/>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
