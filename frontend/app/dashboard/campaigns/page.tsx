'use client';

import { Campaign } from '@/services/campaigns';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/config/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CAMPAIGN_STATES } from '@/config/state-machines';
import { Plus, Send, Search, Filter, MoreHorizontal, Eye, Edit, Trash2, Calendar, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useTrackCampaignUpdates } from '@/hooks/useTrackCampaignUpdates';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_FILTER_OPTIONS = ['ALL', ...Object.keys(CAMPAIGN_STATES)] as const;

export default function CampaignsPage() {
  const router = useRouter();
  const [initialCampaigns, setInitialCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Use real-time campaign tracking
  const { campaigns, setCampaigns } = useTrackCampaignUpdates(initialCampaigns, (campaign) => {
    toast.info(`Campaign "${campaign.name}" status: ${campaign.status}`);
  });

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/campaigns/');
      const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
      setInitialCampaigns(data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/campaigns/${campaignToDelete.id}/`);
      toast.success(`Campaign "${campaignToDelete.name}" deleted`);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignToDelete.id));
      setInitialCampaigns((prev) => prev.filter((c) => c.id !== campaignToDelete.id));
      setCampaignToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete campaign');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch =
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (campaign.subject || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || campaign.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Campaigns"
        description="Manage, schedule, pause, and track your email campaigns"
        actions={
          <Link href="/dashboard/campaigns/new">
            <Button className="gradient-bg border-0 text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        }
      />

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters || statusFilter !== 'ALL' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="gap-2 w-fit"
          >
            <Filter className="h-4 w-4" />
            <span>Status{statusFilter !== 'ALL' ? `: ${CAMPAIGN_STATES[statusFilter]?.label || statusFilter}` : ''}</span>
          </Button>
        </div>

        {(showFilters || statusFilter !== 'ALL') && (
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTER_OPTIONS.map((statusOption) => (
              <Button
                key={statusOption}
                variant={statusFilter === statusOption ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setStatusFilter(statusOption)}
              >
                {statusOption === 'ALL' ? 'All' : (CAMPAIGN_STATES[statusOption]?.label || statusOption)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3 stagger-animation">
          {filteredCampaigns.map((campaign) => (
            <Card 
              key={campaign.id} 
              className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-110">
                      <Send className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link 
                          href={`/dashboard/campaigns/${campaign.id}`} 
                          className="font-semibold text-lg hover:text-primary transition-colors truncate"
                        >
                          {campaign.name}
                        </Link>
                        <StatusBadge domain="campaign" status={campaign.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground truncate">
                        {campaign.subject || 'No subject set'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(campaign.created_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {(campaign.stats_total_recipients ?? campaign.total_recipients ?? 0).toLocaleString()} recipients
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Link href={`/dashboard/campaigns/${campaign.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${campaign.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer"
                          onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                          Manage &amp; Controls
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                          onClick={() => setCampaignToDelete(campaign)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {filteredCampaigns.length === 0 && (
            <EmptyState
              icon={Send}
              title="No campaigns found"
              description={
                searchQuery || statusFilter !== 'ALL'
                  ? 'No campaigns match your current search or status filter.'
                  : 'Get started by creating your first email campaign.'
              }
              action={
                searchQuery || statusFilter !== 'ALL' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('ALL');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/dashboard/campaigns/new">
                    <Button className="gradient-bg border-0 text-white">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Campaign
                    </Button>
                  </Link>
                )
              }
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(campaignToDelete)}
        onOpenChange={(open) => {
          if (!open) setCampaignToDelete(null);
        }}
        title="Delete Campaign"
        description={`Are you sure you want to delete "${campaignToDelete?.name}"? This removes it from your active campaigns list.`}
        confirmLabel="Delete Campaign"
        variant="destructive"
        busy={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
