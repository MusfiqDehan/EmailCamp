'use client';

import { useEffect, useState } from 'react';
import api from '@/config/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, FileText, Users, CheckSquare } from 'lucide-react';

interface DashboardStats {
  total_organizations: number;
  total_global_templates: number;
  total_template_usage: number;
  pending_approvals: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    total_organizations: 0,
    total_global_templates: 0,
    total_template_usage: 0,
    pending_approvals: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      try {
        const response = await api.get('/campaigns/admin/templates/analytics/summary/');
        setStats(response.data.data || {});
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Organizations',
      value: stats.total_organizations,
      icon: Building2,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Global Templates',
      value: stats.total_global_templates,
      icon: FileText,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Template Usage',
      value: stats.total_template_usage,
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Pending Approvals',
      value: stats.pending_approvals,
      icon: CheckSquare,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Platform Administration</h1>
        <p className="text-muted-foreground">
          Manage organizations, global templates, and approvals
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                ) : (
                  stat.value?.toLocaleString() || 0
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/dashboard/admin/templates"
              className="block p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="font-medium">Manage Global Templates</div>
              <div className="text-sm text-muted-foreground">
                Create and manage platform-wide templates
              </div>
            </a>
            <a
              href="/dashboard/admin/approvals"
              className="block p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="font-medium">Review Approvals</div>
              <div className="text-sm text-muted-foreground">
                Approve or reject template update requests
              </div>
            </a>
            <a
              href="/dashboard/admin/organizations"
              className="block p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="font-medium">Manage Organizations</div>
              <div className="text-sm text-muted-foreground">
                View and configure organization settings
              </div>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Activity tracking coming soon...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
