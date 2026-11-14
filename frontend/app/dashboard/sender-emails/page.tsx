'use client';

import { useCallback, useEffect, useState } from 'react';
import { AtSign, Inbox, Loader2, Plus, Trash2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { SendingDomain, fetchDomains } from '@/services/domains';
import {
  SenderEmail,
  createSenderEmail,
  deleteSenderEmail,
  fetchSenderEmails,
} from '@/services/sender-emails';
import { getApiErrorMessage } from '@/config/api-error';

export default function SenderEmailsPage() {
  const [senders, setSenders] = useState<SenderEmail[]>([]);
  const [limits, setLimits] = useState<{ max_sender_emails: number | null; used: number } | null>(null);
  const [verifiedDomains, setVerifiedDomains] = useState<SendingDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [domainId, setDomainId] = useState('');
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [senderToDelete, setSenderToDelete] = useState<SenderEmail | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [senderData, domainData] = await Promise.all([fetchSenderEmails(), fetchDomains()]);
      setSenders(senderData.sender_emails);
      setLimits(senderData.limits);
      setVerifiedDomains(domainData.domains.filter((d) => d.status === 'VERIFIED'));
    } catch {
      toast.error('Failed to load sender emails');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!domainId || !localPart.trim()) return;
    setSubmitting(true);
    try {
      const created = await createSenderEmail({
        domain_id: domainId,
        local_part: localPart.trim(),
        display_name: displayName.trim(),
      });
      toast.success(
        `${created.email_address} created — ${
          created.receiving_supported
            ? 'check your Inbox to receive replies.'
            : 'send-only on org-owned SES.'
        }`
      );
      setCreateOpen(false);
      setLocalPart('');
      setDisplayName('');
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not create sender email'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!senderToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSenderEmail(senderToDelete.id);
      toast.success(`${senderToDelete.email_address} deleted`);
      setSenderToDelete(null);
      await load();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not delete sender email'));
    } finally {
      setIsDeleting(false);
    }
  };

  const atLimit = limits?.max_sender_emails != null && limits.used >= limits.max_sender_emails;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sender Emails"
        description={
          `Create addresses on your verified domains for campaigns and your inbox.${
            limits && limits.max_sender_emails != null ? ` (${limits.used} of ${limits.max_sender_emails} used)` : ''
          }`
        }
        actions={
          <Button onClick={() => setCreateOpen(true)} disabled={verifiedDomains.length === 0 || atLimit}>
            <Plus className="h-4 w-4 mr-2" /> New sender email
          </Button>
        }
      />

      {verifiedDomains.length === 0 && !loading && (
        <Card className="border-yellow-300">
          <CardContent className="py-4 text-sm">
            You need at least one <a className="underline" href="/dashboard/domains">verified sending domain</a>{' '}
            before creating sender emails.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your sender addresses</CardTitle>
          <CardDescription>
            Addresses on platform-managed domains also receive replies into your Inbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : senders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No sender emails yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receiving</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {senders.map((sender) => (
                  <TableRow key={sender.id}>
                    <TableCell className="font-medium">{sender.email_address}</TableCell>
                    <TableCell>{sender.display_name || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge
                        domain="sender_email"
                        status={
                          sender.status === 'ACTIVE'
                            ? sender.is_usable
                              ? 'ACTIVE'
                              : 'DOMAIN_UNAVAILABLE'
                            : sender.status
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {sender.receiving_supported ? (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Inbox className="h-4 w-4" /> Inbox
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Send-only</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSenderToDelete(sender)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New sender email</DialogTitle>
            <DialogDescription>Create an address on one of your verified domains.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Domain</Label>
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a verified domain" />
                </SelectTrigger>
                <SelectContent>
                  {verifiedDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="localPart">Address</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="localPart"
                  placeholder="support"
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value)}
                />
                <span className="text-muted-foreground whitespace-nowrap">
                  @{verifiedDomains.find((d) => d.id === domainId)?.domain || 'domain'}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="displayName">Display name (optional)</Label>
              <Input
                id="displayName"
                placeholder="Acme Support"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting || !domainId || !localPart.trim()}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(senderToDelete)}
        onOpenChange={(open) => {
          if (!open) setSenderToDelete(null);
        }}
        title={`Delete ${senderToDelete?.email_address ?? 'sender email'}?`}
        description="Campaigns configured to send from this address will fail validation at launch time."
        confirmLabel="Delete Sender Email"
        variant="destructive"
        busy={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
