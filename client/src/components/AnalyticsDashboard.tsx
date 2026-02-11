import { useState, useEffect, useCallback } from 'react';
import {
  getAnalyticsSummary,
  getFeatureAdoption,
  getPerformanceMetrics,
  getTopRepos,
  getAnalyticsErrors,
  getAnalyticsTimeSeries,
  checkAnalyticsAccess,
  getUsersActivity,
  getUserDetail,
  type ApiError,
} from '@/api';
import {
  Users,
  Activity,
  Terminal,
  Search,
  Smartphone,
  GitBranch,
  Play,
  AlertCircle,
  X,
  Zap,
  Database,
  RefreshCw,
  ArrowLeft,
  User,
  FileCode,
  ArrowLeft as BackIcon,
} from 'lucide-react';
import type {
  AnalyticsSummaryResponse,
  FeatureAdoptionResponse,
  PerformanceMetricsResponse,
  TopReposResponse,
  ErrorsResponse,
  TimeSeriesResponse,
  UsersResponse,
  UserDetail,
  UserActivitySummary,
} from '@/types/analytics';

interface AnalyticsDashboardProps {
  onClose: () => void;
}

type TabType = 'overview' | 'users' | 'errors';

// Simple line chart component
function LineChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <div className="text-midnight-400 text-sm">No data</div>;

  const max = Math.max(...data.map((d) => d.count), 1);
  const height = 100;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - (d.count / max) * height;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  return (
    <div className="w-full h-32 relative">
      <svg viewBox={`0 0 100 ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="#374151"
            strokeWidth="0.5"
            strokeDasharray="2"
          />
        ))}
        <path d={`${pathD} L 100,${height} L 0,${height} Z`} fill="rgba(212, 162, 67, 0.1)" />
        <path d={pathD} fill="none" stroke="#d4a243" strokeWidth="2" />
        {points.map((point, i) => {
          const [x, y] = point.split(',');
          return <circle key={i} cx={x} cy={y} r="1.5" fill="#d4a243" />;
        })}
      </svg>
      <div className="flex justify-between text-xs text-midnight-400 mt-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// Bar chart for hourly activity
function HourlyBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);

  return (
    <div className="w-full h-32 flex items-end gap-1">
      {data.map((count, hour) => (
        <div
          key={hour}
          className="flex-1 bg-brass-600 hover:bg-brass-500 transition-colors rounded-t"
          style={{ height: `${(count / max) * 100}%` }}
          title={`${hour}:00 - ${count} events`}
        />
      ))}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-midnight-800 rounded-lg p-4 border border-midnight-700">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-midnight-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-midnight-100 mt-1">{value}</p>
          {subtitle && <p className="text-midnight-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className="p-2 bg-midnight-700 rounded-lg">
          <Icon size={20} className="text-brass-500" />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  loading,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-midnight-900 rounded-xl border border-midnight-700 overflow-hidden">
      <div className="px-4 py-3 bg-midnight-800 border-b border-midnight-700">
        <h3 className="text-lg font-semibold text-midnight-100">{title}</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={24} className="text-brass-500 animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function TimePeriodSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const options = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
  ];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-brass-600 text-white'
              : 'bg-midnight-700 text-midnight-300 hover:bg-midnight-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// User list item component
function UserListItem({
  user,
  onClick,
}: {
  user: UserActivitySummary;
  onClick: () => void;
}) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  return (
    <div
      onClick={onClick}
      className="bg-midnight-800 rounded-lg p-4 cursor-pointer hover:bg-midnight-700 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-midnight-700 rounded-lg">
            <User size={20} className="text-brass-500" />
          </div>
          <div>
            <p className="text-midnight-100 font-medium">{user.userEmail}</p>
            <p className="text-midnight-400 text-xs">
              {user.repoCount} repos · First: {formatDate(user.firstSeen)} · Last: {formatDate(user.lastSeen)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-midnight-100">{user.eventCount.toLocaleString()}</p>
          <p className="text-midnight-400 text-xs">events</p>
        </div>
      </div>
      {user.topEvents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {user.topEvents.map(({ event, count }) => (
            <span
              key={event}
              className="px-2 py-0.5 bg-midnight-900 rounded text-xs text-midnight-400"
            >
              {event}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// User detail view
function UserDetailView({
  userEmail,
  days,
  onBack,
}: {
  userEmail: string;
  days: number;
  onBack: () => void;
}) {
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);
      try {
        const detail = await getUserDetail(userEmail, days);
        setUserDetail(detail);
      } catch (err) {
        console.error('Failed to load user detail:', err);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [userEmail, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw size={32} className="text-brass-500 animate-spin" />
      </div>
    );
  }

  if (!userDetail) {
    return (
      <div className="text-center py-8">
        <p className="text-midnight-400">User not found</p>
        <button onClick={onBack} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-midnight-300 hover:text-midnight-100 transition-colors"
      >
        <BackIcon size={18} />
        Back to users
      </button>

      {/* User header */}
      <div className="bg-midnight-800 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-midnight-700 rounded-xl">
            <User size={32} className="text-brass-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-midnight-100">{userDetail.userEmail}</h2>
            <p className="text-midnight-400">
              {userDetail.summary.totalEvents.toLocaleString()} events · {userDetail.summary.repoCount} repos
            </p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-midnight-800 rounded-lg p-4 text-center">
          <FileCode size={20} className="mx-auto mb-2 text-brass-500" />
          <p className="text-2xl font-bold text-midnight-100">{userDetail.summary.fileOpens}</p>
          <p className="text-midnight-400 text-sm">Files Opened</p>
        </div>
        <div className="bg-midnight-800 rounded-lg p-4 text-center">
          <Search size={20} className="mx-auto mb-2 text-brass-500" />
          <p className="text-2xl font-bold text-midnight-100">{userDetail.summary.searches}</p>
          <p className="text-midnight-400 text-sm">Searches</p>
        </div>
        <div className="bg-midnight-800 rounded-lg p-4 text-center">
          <Terminal size={20} className="mx-auto mb-2 text-brass-500" />
          <p className="text-2xl font-bold text-midnight-100">{userDetail.summary.terminalSessions}</p>
          <p className="text-midnight-400 text-sm">Terminal Sessions</p>
        </div>
        <div className="bg-midnight-800 rounded-lg p-4 text-center">
          <Activity size={20} className="mx-auto mb-2 text-brass-500" />
          <p className="text-2xl font-bold text-midnight-100">{userDetail.summary.apiRequests}</p>
          <p className="text-midnight-400 text-sm">API Requests</p>
        </div>
      </div>

      {/* Hourly activity */}
      <Section title="Activity by Hour" loading={false}>
        <HourlyBarChart data={userDetail.activity.eventsByHour} />
        <div className="flex justify-between text-xs text-midnight-400 mt-2">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </Section>

      {/* Event types */}
      <Section title="Event Breakdown" loading={false}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(userDetail.activity.eventsByType)
            .sort(([, a], [, b]) => b - a)
            .map(([event, count]) => (
              <div
                key={event}
                className="flex items-center justify-between p-3 bg-midnight-800 rounded-lg"
              >
                <span className="text-midnight-300 text-sm">{event}</span>
                <span className="font-semibold text-midnight-100">{count}</span>
              </div>
            ))}
        </div>
      </Section>

      {/* Recent events */}
      <Section title="Recent Activity" loading={false}>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {userDetail.recentEvents.map((event, idx) => (
            <div key={idx} className="p-3 bg-midnight-800 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-brass-500 text-sm font-medium">{event.event}</span>
                <span className="text-midnight-500 text-xs">
                  {new Date(event.timestamp).toLocaleString()}
                </span>
              </div>
              {event.repoId && (
                <p className="text-midnight-400 text-xs mt-1">Repo: {event.repoId}</p>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// Users list view
function UsersView({ days }: { days: number }) {
  const [users, setUsers] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const data = await getUsersActivity(days);
        setUsers(data);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, [days]);

  if (selectedUserEmail) {
    return (
      <UserDetailView
        userEmail={selectedUserEmail}
        days={days}
        onBack={() => setSelectedUserEmail(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Section title={`Active Users (${users?.count ?? 0})`} loading={loading}>
        <div className="space-y-3">
          {users?.users.map((user) => (
            <UserListItem
              key={user.userEmail}
              user={user}
              onClick={() => setSelectedUserEmail(user.userEmail)}
            />
          ))}
          {users?.users.length === 0 && (
            <p className="text-center text-midnight-400 py-8">No user activity recorded yet</p>
          )}
        </div>
      </Section>
    </div>
  );
}

// Main dashboard component
export function AnalyticsDashboard({ onClose }: AnalyticsDashboardProps) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [featureAdoption, setFeatureAdoption] = useState<FeatureAdoptionResponse | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetricsResponse | null>(null);
  const [topRepos, setTopRepos] = useState<TopReposResponse | null>(null);
  const [errors, setErrors] = useState<ErrorsResponse | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null);

  const checkAccess = useCallback(async () => {
    try {
      const access = await checkAnalyticsAccess();
      if (!access.isAdmin) {
        setError(`Access denied. Your email (${access.email}) is not configured as an admin.`);
        return false;
      }
      return true;
    } catch (err) {
      setError('Failed to verify admin access. Please try again.');
      return false;
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const hasAccess = await checkAccess();
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    try {
      const [
        summaryRes,
        featureRes,
        perfRes,
        reposRes,
        errorsRes,
        timeSeriesRes,
      ] = await Promise.all([
        getAnalyticsSummary(days),
        getFeatureAdoption(days),
        getPerformanceMetrics(days),
        getTopRepos(days),
        getAnalyticsErrors(days),
        getAnalyticsTimeSeries(
          ['api_request', 'file_opened', 'terminal_connected', 'search_performed'],
          days
        ),
      ]);

      setSummary(summaryRes);
      setFeatureAdoption(featureRes);
      setPerformance(perfRes);
      setTopRepos(reposRes);
      setErrors(errorsRes);
      setTimeSeries(timeSeriesRes);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 403) {
        setError('You do not have permission to access analytics. Please contact your administrator.');
      } else {
        setError('Failed to load analytics data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [days, checkAccess]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-midnight-950 z-50 flex flex-col">
        <header className="flex items-center gap-4 px-4 py-3 bg-midnight-900 border-b border-midnight-700">
          <button
            onClick={onClose}
            className="p-2 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-midnight-100">Analytics Dashboard</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <AlertCircle size={64} className="mx-auto mb-6 text-red-500" />
            <h2 className="text-xl font-bold text-midnight-100 mb-4">Access Denied</h2>
            <p className="text-midnight-400">{error}</p>
            <button onClick={onClose} className="btn btn-primary mt-6">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
  ];

  if (errors && errors.totalErrors > 0) {
    tabs.push({ id: 'errors', label: `Errors (${errors.totalErrors})` });
  }

  return (
    <div className="fixed inset-0 bg-midnight-950 z-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 bg-midnight-900 border-b border-midnight-700">
        <button
          onClick={onClose}
          className="p-2 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-midnight-100">Analytics Dashboard</h1>
        <div className="flex-1" />
        <TimePeriodSelector value={days} onChange={setDays} />
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onClose}
          className="p-2 hover:bg-midnight-800 rounded text-midnight-300 hover:text-midnight-100"
        >
          <X size={20} />
        </button>
      </header>

      {/* Tab Navigation */}
      <div className="bg-midnight-900 border-b border-midnight-700 px-4">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brass-500 text-brass-500'
                  : 'border-transparent text-midnight-400 hover:text-midnight-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Total Events"
                  value={summary?.summary.totalEvents.toLocaleString() ?? '-'}
                  subtitle="All tracked events"
                  icon={Activity}
                />
                <MetricCard
                  title="Unique Users"
                  value={summary?.summary.uniqueUsers.toLocaleString() ?? '-'}
                  subtitle="Active users"
                  icon={Users}
                />
                <MetricCard
                  title="Avg API Response"
                  value={performance?.metrics.avgApiResponseTime
                    ? `${Math.round(performance.metrics.avgApiResponseTime)}ms`
                    : '-'}
                  subtitle={`P95: ${performance?.metrics.p95ApiResponseTime
                    ? `${Math.round(performance.metrics.p95ApiResponseTime)}ms`
                    : '-'}`}
                  icon={Zap}
                />
                <MetricCard
                  title="Avg File Load"
                  value={performance?.metrics.avgFileLoadTime
                    ? `${Math.round(performance.metrics.avgFileLoadTime)}ms`
                    : '-'}
                  subtitle={`P95: ${performance?.metrics.p95FileLoadTime
                    ? `${Math.round(performance.metrics.p95FileLoadTime)}ms`
                    : '-'}`}
                  icon={Database}
                />
              </div>

              {/* Activity Chart */}
              <Section title="Activity Trends" loading={loading && !timeSeries}>
                <LineChart data={timeSeries?.data ?? []} />
              </Section>

              {/* Feature Adoption */}
              <Section title="Feature Adoption" loading={loading && !featureAdoption}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {featureAdoption && (
                    <>
                      <div className="text-center p-4 bg-midnight-800 rounded-lg">
                        <Terminal size={24} className="mx-auto mb-2 text-brass-500" />
                        <p className="text-2xl font-bold text-midnight-100">
                          {featureAdoption.metrics.terminalUsers}
                        </p>
                        <p className="text-midnight-400 text-sm">Terminal Users</p>
                      </div>
                      <div className="text-center p-4 bg-midnight-800 rounded-lg">
                        <Search size={24} className="mx-auto mb-2 text-brass-500" />
                        <p className="text-2xl font-bold text-midnight-100">
                          {featureAdoption.metrics.searchUsers}
                        </p>
                        <p className="text-midnight-400 text-sm">Search Users</p>
                      </div>
                      <div className="text-center p-4 bg-midnight-800 rounded-lg">
                        <Smartphone size={24} className="mx-auto mb-2 text-brass-500" />
                        <p className="text-2xl font-bold text-midnight-100">
                          {featureAdoption.metrics.mobileUsers}
                        </p>
                        <p className="text-midnight-400 text-sm">Mobile Users</p>
                      </div>
                      <div className="text-center p-4 bg-midnight-800 rounded-lg">
                        <GitBranch size={24} className="mx-auto mb-2 text-brass-500" />
                        <p className="text-2xl font-bold text-midnight-100">
                          {featureAdoption.metrics.gitFeatureUsers}
                        </p>
                        <p className="text-midnight-400 text-sm">Git Users</p>
                      </div>
                      <div className="text-center p-4 bg-midnight-800 rounded-lg">
                        <Play size={24} className="mx-auto mb-2 text-brass-500" />
                        <p className="text-2xl font-bold text-midnight-100">
                          {featureAdoption.metrics.taskRunnerUsers}
                        </p>
                        <p className="text-midnight-400 text-sm">Task Users</p>
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* Top Repositories */}
              <Section title="Most Active Repositories" loading={loading && !topRepos}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-midnight-700">
                        <th className="text-left py-2 px-3 text-midnight-400 font-medium">Repository</th>
                        <th className="text-right py-2 px-3 text-midnight-400 font-medium">Events</th>
                        <th className="text-right py-2 px-3 text-midnight-400 font-medium">Users</th>
                        <th className="text-right py-2 px-3 text-midnight-400 font-medium">Files Opened</th>
                        <th className="text-right py-2 px-3 text-midnight-400 font-medium">Searches</th>
                        <th className="text-right py-2 px-3 text-midnight-400 font-medium">Terminal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRepos?.repos.slice(0, 10).map((repo) => (
                        <tr key={repo.repoId} className="border-b border-midnight-800 last:border-0">
                          <td className="py-2 px-3 text-midnight-200 font-medium">{repo.repoId}</td>
                          <td className="py-2 px-3 text-midnight-300 text-right">
                            {repo.eventCount.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-midnight-300 text-right">
                            {repo.uniqueUsers.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-midnight-300 text-right">
                            {repo.fileOpens.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-midnight-300 text-right">
                            {repo.searches.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-midnight-300 text-right">
                            {repo.terminalSessions.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Event Breakdown */}
              <Section title="Event Breakdown" loading={loading && !summary}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {summary &&
                    Object.entries(summary.summary.eventsByType)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 12)
                      .map(([event, count]) => (
                        <div
                          key={event}
                          className="flex items-center justify-between p-3 bg-midnight-800 rounded-lg"
                        >
                          <span className="text-midnight-300 text-sm">{event}</span>
                          <span className="font-semibold text-midnight-100">{count}</span>
                        </div>
                      ))}
                </div>
              </Section>
            </div>
          )}

          {activeTab === 'users' && <UsersView days={days} />}

          {activeTab === 'errors' && errors && errors.totalErrors > 0 && (
            <div className="space-y-6">
              <Section title={`Errors (${errors.totalErrors} total)`} loading={loading && !errors}>
                <div className="space-y-3">
                  {Object.entries(errors.errorsByType).map(([type, stats]) => (
                    <div key={type} className="bg-midnight-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={16} className="text-red-500" />
                        <span className="font-medium text-midnight-200">{type}</span>
                        <span className="text-midnight-400 text-sm">({stats.count} occurrences)</span>
                      </div>
                      {Object.entries(stats.endpoints).length > 0 && (
                        <div className="ml-6 space-y-1">
                          {Object.entries(stats.endpoints).map(([endpoint, count]) => (
                            <div key={endpoint} className="flex items-center justify-between text-sm">
                              <span className="text-midnight-400 font-mono">{endpoint}</span>
                              <span className="text-midnight-500">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
