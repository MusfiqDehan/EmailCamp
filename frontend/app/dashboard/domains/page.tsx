'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DnsRecord,
  DomainLimits,
  SendingDomain,
  deleteDomain,
  fetchDomains,
  registerDomain,
  verifyDomainNow,
} from '@/services/domains';
import { getApiErrorMessage } from '@/config/api-error';

function DnsRecordsTable({ records }: { records: DnsRecord[] }) {
  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success('Copied to clipboard');
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Name / Host</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono">{record.type}</TableCell>
            <TableCell className="font-mono text-xs break-all max-w-[220px]">{record.name}</TableCell>
            <TableCell className="font-mono text-xs break-all max-w-[260px]">{record.value}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{record.purpose}</TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => copy(`${record.name} ${record.type} ${record.value}`)}>
                <Copy className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function DomainsPage() {
  const [dnsDomain, setDnsDomain] = useState<SendingDomain | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [domainToDelete, setDomainToDelete] = useState<SendingDomain | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchDomains();
      setDomains(data.domains);
      setLimits(data.limits);
    } catch {
      toast.error('Failed to load domains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setSubmitting(true);
    try {
      const created = await registerDomain({
        domain: newDomain.trim(),
        ownership_mode: ownershipMode,
        provider_id: ownershipMode === 'ORG' ? providerId || null : null,
      });
      toast.success('Domain registered — add the DNS records to verify it.');
      setAddOpen(false);
      setNewDomain('');
      setDnsDomain(created);
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not register domain'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (domain: SendingDomain) => {
    setVerifyingId(domain.id);
    try {
      const result = await verifyDomainNow(domain.id);
      if (result.verified) {
        toast.success(`${domain.domain} is verified!`);
      } else {
        toast.info('Not verified yet — DNS propagation can take up to 48h.');
      }
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Verification check failed. Try again in a minute.'));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!domainToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDomain(domainToDelete.id);
      toast.success(`${domainToDelete.domain} deleted`);
      setDomainToDelete(null);
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not delete domain'));
    } finally {
      setIsDeleting(false);
    }
  };

  const atLimit =
    limits?.max_domains != null && limits.used >= limits.max_domains;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sending Domains"
        description={
          `Register your own domains to send and receive email from addresses you control.${
            limits && limits.max_domains != null ? ` (${limits.used} of ${limits.max_domains} used)` : ''
          }`
        }
        actions={
          <Button onClick={() => setAddOpen(true)} disabled={!limits?.feature_enabled || !limits?.custom_domain_allowed || atLimit}>
            <Plus className="h-4 w-4 mr-2" /> Add domain
          </Button>
        }
      />

      {limits && !limits.feature_enabled && (
        <Card className="border-yellow-300">
          <CardContent className="py-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            The sending-domains feature is currently disabled for your organization. Contact support.
          </CardContent>
        </Card>
      )}
      {limits && limits.feature_enabled && !limits.custom_domain_allowed && (
        <Card className="border-yellow-300">
          <CardContent className="py-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Your current package does not include custom sending domains. Upgrade to unlock this feature.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your domains</CardTitle>
          <CardDescription>
            Verified domains can host as many sender addresses as your package allows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : domains.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No domains yet. Add your first domain to start sending from your own addresses.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Sender emails</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-medium">
                      {domain.domain}
                      {domain.verification_error && (
                        <p className="text-xs text-red-500 mt-1">{domain.verification_error}</p>
                      )}
                      {domain.status === 'SUSPENDED' && domain.suspension_reason && (
                        <p className="text-xs text-red-500 mt-1">{domain.suspension_reason}</p>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge domain="sending_domain" status={domain.status} /></TableCell>
                    <TableCell className="text-sm">
                      {domain.ownership_mode === 'PLATFORM' ? 'Platform-managed' : 'Own AWS account'}
                    </TableCell>
                    <TableCell>{domain.sender_email_count}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setDnsDomain(domain)}>
                          DNS records
                        </Button>
                        {domain.status !== 'VERIFIED' && domain.status !== 'SUSPENDED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerify(domain)}
                            disabled={verifyingId === domain.id}
                          >
                            {verifyingId === domain.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            <span className="ml-1">Check</span>
                          </Button>
                        )}
                        {domain.status === 'VERIFIED' && (
                          <CheckCircle2 className="h-5 w-5 text-green-500 self-center ml-1" />
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDomainToDelete(domain)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add domain dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a sending domain</DialogTitle>
            <DialogDescription>
              After registering, you&apos;ll get DNS records to add at your DNS provider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="mail.yourcompany.com or yourcompany.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
            {limits?.org_owned_ses_allowed && (
              <div className="space-y-2">
                <Label>Where should the domain be verified?</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={ownershipMode === 'PLATFORM' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOwnershipMode('PLATFORM')}
                  >
                    Platform (recommended)
                  </Button>
                  <Button
                    type="button"
                    variant={ownershipMode === 'ORG' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOwnershipMode('ORG')}
                  >
                    My own AWS SES account
                  </Button>
                </div>
                {ownershipMode === 'ORG' && (
                  <div>
                    <Label htmlFor="provider">AWS SES provider ID</Label>
                    <Input
                      id="provider"
                      placeholder="UUID of your connected AWS SES provider"
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Note: receiving email is only supported for platform-managed domains.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting || !newDomain.trim()}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Register domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNS records dialog */}
      <Dialog open={!!dnsDomain} onOpenChange={(open) => !open && setDnsDomain(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>DNS records for {dnsDomain?.domain}</DialogTitle>
            <DialogDescription>
              Add these records at your DNS provider. Verification usually completes within minutes
              after propagation, and we re-check automatically every 10 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            {dnsDomain && <DnsRecordsTable records={dnsDomain.dns_records} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnsDomain(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(domainToDelete)}
        onOpenChange={(open) => {
          if (!open) setDomainToDelete(null);
        }}
        title={`Delete ${domainToDelete?.domain ?? 'domain'}?`}
        description="Deleting this domain immediately disables all sender email addresses linked to it. Active campaigns using them will fail to launch."
        confirmLabel="Delete Domain"
        variant="destructive"
        busy={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
