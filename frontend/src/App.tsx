import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import axios from 'axios';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  ClipboardCopy,
  Download,
  Gauge,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API_TOKEN_KEY = 'edupulse_auth_token';
const PREFERENCES_KEY = 'edupulse_dashboard_preferences';
const api = axios.create({ baseURL: API_BASE });
const COLORS = ['#d98a68', '#e9b46f', '#a9b798', '#e3cf78', '#d68f9b', '#ba795d', '#8baeb0', '#c89c71', '#9eb9a0', '#d78068', '#e0c36a'];
const SURVEY_TEMPLATES = {
  general: { label: 'General campus feedback', prompt: 'Share your feedback about your campus experience.' },
  facilities: { label: 'Facilities', prompt: 'Tell us about campus facilities, accessibility, and maintenance.' },
  teaching: { label: 'Teaching and courses', prompt: 'Share feedback about teaching quality and your courses.' },
  student_services: { label: 'Student services', prompt: 'Tell us about student support and campus services.' },
};

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'upload', label: 'Batch Analyzer', icon: UploadCloud },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'model', label: 'Model performance', icon: Gauge },
  { id: 'analyzer', label: 'Analyze feedback', icon: BrainCircuit },
  { id: 'feedback', label: 'Feedback & reviews', icon: MessageSquareText },
  { id: 'form', label: 'Survey builder', icon: Wand2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

type DashboardPreferences = {
  compactMode: boolean;
  refreshInterval: number;
};

const DEFAULT_PREFERENCES: DashboardPreferences = {
  compactMode: false,
  refreshInterval: 0,
};

function loadPreferences(): DashboardPreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_KEY);
    if (!saved) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(saved) as Partial<DashboardPreferences>;
    return {
      compactMode: parsed.compactMode === true,
      refreshInterval: [0, 1, 5, 15].includes(Number(parsed.refreshInterval)) ? Number(parsed.refreshInterval) : 0,
    };
  } catch (error) {
    console.warn('Unable to load dashboard preferences; using defaults.', error);
    return DEFAULT_PREFERENCES;
  }
}

const defaultAuthForm = {
  email: '',
  password: '',
  full_name: '',
  college_id: '',
  department: 'Academic Affairs',
  role: 'faculty',
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(API_TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [preferences, setPreferences] = useState<DashboardPreferences>(loadPreferences);
  const [analyticsFilters, setAnalyticsFilters] = useState({ startDate: '', endDate: '', category: '', source: '', department: '' });
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(API_TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [health, setHealth] = useState<any>(null);
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [dataError, setDataError] = useState('');
  const [singleText, setSingleText] = useState('');
  const [singleResult, setSingleResult] = useState<any>(null);
  const [predictionBusy, setPredictionBusy] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [batchSummary, setBatchSummary] = useState<any>(null);
  const [uploadError, setUploadError] = useState('');
  const [fileName, setFileName] = useState('');
  const [formTitle, setFormTitle] = useState('Campus Feedback Survey');
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [surveyMode] = useState(() => new URLSearchParams(window.location.search).has('survey'));
  const [surveyTitle] = useState(() => new URLSearchParams(window.location.search).get('title') || 'Campus Feedback Survey');
  const [publicFeedback, setPublicFeedback] = useState('');
  const [publicFeedbackResult, setPublicFeedbackResult] = useState<any>(null);
  const [publicFeedbackError, setPublicFeedbackError] = useState('');
  const [publicFeedbackBusy, setPublicFeedbackBusy] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<any[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState('pending');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackReload, setFeedbackReload] = useState(0);
  const [feedbackError, setFeedbackError] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [reviewDueDates, setReviewDueDates] = useState<Record<number, string>>({});
  const [reviewActivities, setReviewActivities] = useState<Record<number, any[]>>({});
  const [openReviewHistory, setOpenReviewHistory] = useState<Record<number, boolean>>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [surveys, setSurveys] = useState<any[]>([]);
  const [surveyTemplate, setSurveyTemplate] = useState<keyof typeof SURVEY_TEMPLATES>('general');
  const [surveyPrompt, setSurveyPrompt] = useState(SURVEY_TEMPLATES.general.prompt);
  const [surveyMaxResponses, setSurveyMaxResponses] = useState('');
  const [surveyClosesAt, setSurveyClosesAt] = useState('');
  const [surveyBusy, setSurveyBusy] = useState(false);
  const [surveyError, setSurveyError] = useState('');
  const [surveyStatus, setSurveyStatus] = useState<any>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [auditError, setAuditError] = useState('');

  const loadApiState = async () => {
    setDataError('');
    try {
      const analyticsParams: Record<string, string> = {};
      if (analyticsFilters.startDate) analyticsParams.start_date = analyticsFilters.startDate;
      if (analyticsFilters.endDate) analyticsParams.end_date = analyticsFilters.endDate;
      if (analyticsFilters.category) analyticsParams.category = analyticsFilters.category;
      if (analyticsFilters.source) analyticsParams.source = analyticsFilters.source;
      if (analyticsFilters.department) analyticsParams.department = analyticsFilters.department;
      const [healthRes, infoRes, metricsRes, analyticsRes, overviewRes] = await Promise.all([
        api.get('/api/health'),
        api.get('/api/model-info'),
        api.get('/api/model-metrics'),
        api.get('/api/feedback/analytics', { params: analyticsParams }),
        api.get('/api/college/overview'),
      ]);
      setHealth(healthRes.data);
      setModelInfo(infoRes.data);
      setMetrics(metricsRes.data);
      setAnalytics(analyticsRes.data);
      setOverview(overviewRes.data);
    } catch (error) {
      console.error(error);
      setHealth({ status: 'offline', model_loaded: false, message: 'Unable to load dashboard data.' });
      setDataError('Dashboard data could not be loaded. Check the API connection and retry.');
    }
  };

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }

    const loadProfile = async () => {
      try {
        const response = await api.get('/api/auth/me');
        setCurrentUser(response.data);
      } catch (error) {
        console.error(error);
        localStorage.removeItem(API_TOKEN_KEY);
        setToken(null);
        setCurrentUser(null);
      }
    };

    void loadProfile();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadApiState();
  }, [token, analyticsFilters]);

  useEffect(() => {
    if (!token) return;
    api.get('/api/departments')
      .then((response) => setDepartmentOptions(response.data))
      .catch((error) => console.error('Departments could not be loaded.', error));
  }, [token]);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!token || preferences.refreshInterval === 0) return;
    const timer = window.setInterval(() => void loadApiState(), preferences.refreshInterval * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [token, preferences.refreshInterval, analyticsFilters]);

  useEffect(() => {
    if (!token) return;
    setNotificationError('');
    api.get('/api/notifications')
      .then((response) => {
        setNotifications(response.data.items);
        setUnreadNotifications(response.data.unread_count);
      })
      .catch((error) => {
        console.error(error);
        setNotificationError('Notifications could not be loaded.');
      });
  }, [token, activeTab, feedbackReload]);

  useEffect(() => {
    if (!token || activeTab !== 'form') return;
    api.get('/api/surveys')
      .then((response) => setSurveys(response.data))
      .catch((error) => {
        console.error(error);
        setSurveyError('Saved surveys could not be loaded.');
      });
  }, [token, activeTab, generatedLink]);

  useEffect(() => {
    if (!token || activeTab !== 'settings') return;
    setAuditError('');
    api.get('/api/audit-events')
      .then((response) => setAuditEvents(response.data))
      .catch((error) => {
        console.error(error);
        setAuditError('Audit history could not be loaded.');
      });
  }, [token, activeTab]);

  useEffect(() => {
    if (!surveyMode) return;
    const publicId = new URLSearchParams(window.location.search).get('survey');
    if (!publicId) return;
    setSurveyLoading(true);
    api.get(`/api/public/surveys/${encodeURIComponent(publicId)}`)
      .then((response) => setSurveyStatus(response.data))
      .catch((error) => {
        if (error?.response?.status === 404) {
          setSurveyStatus({ id: null, title: surveyTitle, prompt: 'Share your feedback', status: 'open' });
          return;
        }
        console.error(error);
        setPublicFeedbackError('Survey details could not be loaded. Please retry later.');
      })
      .finally(() => setSurveyLoading(false));
  }, [surveyMode, surveyTitle]);

  useEffect(() => {
    if (!token || activeTab !== 'feedback') return;
    const params: Record<string, string> = {};
    if (feedbackFilter !== 'all') params.status = feedbackFilter;
    if (feedbackSearch.trim()) params.q = feedbackSearch.trim();
    api.get('/api/feedback', { params })
      .then((response) => setFeedbackItems(response.data.items))
      .catch((error) => {
        console.error(error);
        setFeedbackError('Feedback records could not be loaded.');
      });
  }, [activeTab, token, feedbackFilter, feedbackSearch, feedbackReload]);

  const categoryChartData = useMemo<any[]>(() => {
    if (metrics?.comparison) {
      return Object.entries(metrics.comparison as Record<string, { accuracy?: number; macro_f1?: number }>).map(([name, value]) => ({
        name,
        accuracy: Number(value.accuracy || 0),
        macroF1: Number(value.macro_f1 || 0),
      }));
    }
    return [];
  }, [metrics]);

  const pieData = useMemo<any[]>(() => {
    const source = Object.entries((analytics?.category_counts || {}) as Record<string, number>).map(([label, value]) => ({
      name: label,
      value: Number(value || 0),
    }));
    return source.filter((item) => item.value > 0);
  }, [analytics]);

  const topCategory = useMemo(() => {
    const list = pieData.slice().sort((a, b) => b.value - a.value);
    return list[0]?.name || 'No feedback yet';
  }, [pieData]);

  const modelMetrics = metrics?.metrics || metrics || {};
  const dailyTrend = analytics?.daily_trend || [];
  const activeDepartmentCount = Number(overview?.active_departments || 0);
  const activeUserCount = Number(overview?.total_users || 0);

  const handleAuthFieldChange = (field: string, value: string) => {
    setAuthForm((current) => ({ ...current, [field]: value }));
  };

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        authMode === 'login'
          ? {
              email: authForm.email,
              password: authForm.password,
            }
          : {
              college_id: authForm.college_id,
              full_name: authForm.full_name,
              email: authForm.email,
              password: authForm.password,
              role: authForm.role,
              department: authForm.department,
            };

      const response = await api.post(endpoint, payload);
      const { access_token, user } = response.data;
      localStorage.setItem(API_TOKEN_KEY, access_token);
      setToken(access_token);
      setCurrentUser(user);
      setAuthForm(defaultAuthForm);
    } catch (error: any) {
      setAuthError(error?.response?.data?.detail || 'Authentication failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(API_TOKEN_KEY);
    setToken(null);
    setCurrentUser(null);
    setAuthMode('login');
  };

  const handleSinglePredict = async () => {
    if (!singleText.trim()) {
      setPredictionError('Enter feedback text before analyzing.');
      return;
    }
    setPredictionBusy(true);
    setPredictionError('');
    try {
      const response = await api.post('/api/predict', { feedback: singleText.trim() });
      setSingleResult(response.data);
      void loadApiState();
    } catch (error: any) {
      console.error(error);
      setPredictionError(error?.response?.data?.detail || 'The feedback could not be analyzed. Please retry.');
    } finally {
      setPredictionBusy(false);
    }
  };

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    event.target.value = '';
    setUploading(true);
    setUploadError('');
    setFileName(nextFile.name);

    try {
      const formData = new FormData();
      formData.append('file', nextFile);
      formData.append('feedback_column', 'feedback');
      const response = await api.post('/api/batch-classify', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBatchSummary(response.data);
      void loadApiState();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Could not classify the uploaded file.';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateLink = async () => {
    setSurveyBusy(true);
    setSurveyError('');
    try {
      const response = await api.post('/api/surveys', {
        title: formTitle.trim() || 'Campus Feedback Survey',
        prompt: surveyPrompt,
        template: surveyTemplate,
        max_responses: surveyMaxResponses ? Number(surveyMaxResponses) : null,
        closes_at: surveyClosesAt ? new Date(surveyClosesAt).toISOString() : null,
      });
      const link = new URL(window.location.origin);
      link.searchParams.set('survey', response.data.id);
      link.searchParams.set('title', response.data.title);
      setGeneratedLink(link.toString());
      setLinkCopied(false);
    } catch (error: any) {
      console.error(error);
      setSurveyError(error?.response?.data?.detail || 'The survey could not be created.');
    } finally {
      setSurveyBusy(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
    } catch (error) {
      console.error(error);
      setLinkCopied(false);
    }
  };

  const handlePublicFeedbackSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPublicFeedbackBusy(true);
    setPublicFeedbackError('');
    try {
      const response = await api.post('/api/public/feedback', {
        feedback: publicFeedback,
        consent: consentAccepted,
        survey_id: surveyStatus?.id || undefined,
      });
      setPublicFeedbackResult(response.data);
      setPublicFeedback('');
      setConsentAccepted(false);
      if (surveyStatus?.id) {
        try {
          const updatedSurvey = await api.get(`/api/public/surveys/${encodeURIComponent(surveyStatus.id)}`);
          setSurveyStatus(updatedSurvey.data);
        } catch (error) {
          console.error('The response was recorded, but survey statistics could not be refreshed.', error);
          setPublicFeedbackError('Your response was recorded, but the survey response count could not be refreshed. Please reload to check the latest status.');
        }
      }
    } catch (error: any) {
      console.error(error);
      setPublicFeedbackError(error?.response?.data?.detail || 'Your feedback could not be submitted. Please try again.');
    } finally {
      setPublicFeedbackBusy(false);
    }
  };

  const handleReviewUpdate = async (feedbackId: number, status: string) => {
    setFeedbackError('');
    try {
      const notes = reviewNotes[feedbackId] ?? feedbackItems.find((item) => item.id === feedbackId)?.review_notes ?? '';
      await api.patch(`/api/feedback/${feedbackId}/review`, { status, notes });
      setFeedbackReload((value) => value + 1);
      void loadApiState();
      void loadReviewActivity(feedbackId);
    } catch (error: any) {
      console.error(error);
      setFeedbackError(error?.response?.data?.detail || 'The review status could not be updated.');
    }
  };

  const handleAssignReview = async (feedbackId: number) => {
    setFeedbackError('');
    try {
      await api.patch(`/api/feedback/${feedbackId}/assignment`, {
        due_at: reviewDueDates[feedbackId] ? new Date(reviewDueDates[feedbackId]).toISOString() : null,
      });
      setFeedbackReload((value) => value + 1);
      void loadReviewActivity(feedbackId);
    } catch (error: any) {
      console.error(error);
      setFeedbackError(error?.response?.data?.detail || 'The review could not be assigned.');
    }
  };

  const handleSaveReviewNotes = async (feedbackId: number) => {
    setFeedbackError('');
    try {
      const notes = reviewNotes[feedbackId] ?? feedbackItems.find((item) => item.id === feedbackId)?.review_notes ?? '';
      await api.patch(`/api/feedback/${feedbackId}/notes`, { notes });
      setFeedbackReload((value) => value + 1);
      void loadReviewActivity(feedbackId);
    } catch (error: any) {
      console.error(error);
      setFeedbackError(error?.response?.data?.detail || 'Review notes could not be saved.');
    }
  };

  const loadReviewActivity = async (feedbackId: number) => {
    try {
      const response = await api.get(`/api/feedback/${feedbackId}/activity`);
      setReviewActivities((current) => ({ ...current, [feedbackId]: response.data }));
    } catch (error) {
      console.error('Review activity could not be loaded.', error);
      setFeedbackError('Review activity could not be loaded.');
    }
  };

  const toggleReviewHistory = async (feedbackId: number) => {
    const nextOpen = !openReviewHistory[feedbackId];
    setOpenReviewHistory((current) => ({ ...current, [feedbackId]: nextOpen }));
    if (nextOpen && reviewActivities[feedbackId] === undefined) await loadReviewActivity(feedbackId);
  };

  const handleMarkNotificationRead = async (notificationId: number) => {
    try {
      await api.patch(`/api/notifications/${notificationId}/read`);
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, is_read: true } : item));
      setUnreadNotifications((count) => Math.max(0, count - 1));
    } catch (error) {
      console.error('Notification could not be marked read.', error);
    }
  };

  const toggleNotifications = async () => {
    const willOpen = !notificationsOpen;
    setNotificationsOpen(willOpen);
    if (!willOpen) return;
    setNotificationError('');
    try {
      const response = await api.get('/api/notifications');
      setNotifications(response.data.items);
      setUnreadNotifications(response.data.unread_count);
    } catch (error) {
      console.error(error);
      setNotificationError('Notifications could not be loaded.');
    }
  };

  const downloadFeedbackReport = async () => {
    try {
      const params: Record<string, string> = {};
      if (analyticsFilters.startDate) params.start_date = analyticsFilters.startDate;
      if (analyticsFilters.endDate) params.end_date = analyticsFilters.endDate;
      if (analyticsFilters.category) params.category = analyticsFilters.category;
      if (analyticsFilters.source) params.source = analyticsFilters.source;
      if (analyticsFilters.department) params.department = analyticsFilters.department;
      const response = await api.get('/api/feedback/report.csv', { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'edupulse-feedback-report.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Feedback report could not be downloaded.', error);
      setDataError('The feedback report could not be downloaded.');
    }
  };

  const downloadBatchCsv = () => {
    if (!batchSummary?.results?.length) return;
    const columns = ['row_index', 'original_feedback', 'predicted_category', 'confidence', 'human_review'];
    const csv = [
      columns.join(','),
      ...batchSummary.results.map((row: Record<string, unknown>) =>
        columns.map((column) => `"${String(row[column] ?? '').replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.[^.]+$/, '') || 'feedback-results'}-classified.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const batchCategories = (batchSummary?.category_counts || {}) as Record<string, number>;
  const primaryCategory = Object.entries(batchCategories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  if (surveyMode) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
        <section className="mx-auto max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">EduPulse · Student voice</p>
          <h1 className="mt-3 text-3xl font-bold text-white">{surveyStatus?.title || surveyTitle}</h1>
          {surveyStatus?.prompt && <p className="mt-3 text-slate-300">{surveyStatus.prompt}</p>}
          {surveyStatus?.id && <p className="mt-2 text-xs text-slate-400">{surveyStatus.response_count} responses{surveyStatus.max_responses ? ` · limit ${surveyStatus.max_responses}` : ''}{surveyStatus.closes_at ? ` · closes ${new Date(surveyStatus.closes_at).toLocaleString()}` : ''}</p>}
          {surveyLoading ? (
            <p role="status" className="mt-8 rounded-2xl bg-slate-800 p-5 text-sm text-slate-300">Loading survey details…</p>
          ) : surveyStatus?.status === 'closed' ? (
            <div role="status" className="mt-8 rounded-2xl border border-amber-300 bg-amber-100 p-5 text-amber-900">
              <p className="font-semibold">This survey is closed.</p>
              <p className="mt-1 text-sm">Thank you for your interest. This survey is no longer accepting responses.</p>
            </div>
          ) : publicFeedbackResult ? (
            <div className="mt-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <p className="font-semibold text-emerald-200">Thank you. Your feedback has been recorded.</p>
              <p className="mt-2 text-sm text-slate-200">It was categorized as {publicFeedbackResult.predicted_category}.</p>
            </div>
          ) : (
            <form onSubmit={handlePublicFeedbackSubmit} className="mt-8 space-y-4">
              <label htmlFor="public-feedback" className="block text-sm text-slate-300">{surveyStatus?.prompt || 'Your feedback'}</label>
              <textarea
                id="public-feedback"
                value={publicFeedback}
                onChange={(event) => setPublicFeedback(event.target.value)}
                rows={7}
                maxLength={10000}
                required
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-100 outline-none focus:border-sky-400"
                placeholder="Share your campus experience or suggestion..."
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Responses are kept for up to 90 days, then automatically deleted.</span>
                <span>{publicFeedback.length}/10000</span>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">
                <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-[#d98a68]" />
                <span>I consent to EduPulse processing and storing this feedback for institutional review and analytics. Feedback is automatically deleted after 90 days.</span>
              </label>
              {publicFeedbackError && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{publicFeedbackError}</p>}
              <button type="submit" disabled={publicFeedbackBusy || !consentAccepted || !publicFeedback.trim()} className="w-full rounded-full bg-sky-500 px-5 py-3 font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
                {publicFeedbackBusy ? 'Submitting…' : 'Submit feedback'}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-700 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/70">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">EduPulse</p>
            <h1 className="mt-3 text-3xl font-bold text-white">Institutional Access</h1>
            <p className="mt-2 text-sm text-slate-400">College login for campus feedback intelligence</p>
          </div>

          <div className="mb-6 inline-flex w-full rounded-full border border-slate-700 bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${authMode === 'login' ? 'bg-sky-500 text-slate-100' : 'text-slate-300'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${authMode === 'register' ? 'bg-sky-500 text-slate-100' : 'text-slate-300'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm text-slate-300">Full name</label>
                  <input
                    value={authForm.full_name}
                    onChange={(event) => handleAuthFieldChange('full_name', event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                    placeholder="Dr. Aisha Patel"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-slate-300">College ID</label>
                  <input
                    value={authForm.college_id}
                    onChange={(event) => handleAuthFieldChange('college_id', event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                    placeholder="CO-2024-118"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm text-slate-300">Role</label>
                    <select
                      value={authForm.role}
                      onChange={(event) => handleAuthFieldChange('role', event.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                    >
                      <option value="faculty">Faculty</option>
                      <option value="admin">Administrator</option>
                      <option value="dean">Dean</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-slate-300">Department</label>
                    <input
                      value={authForm.department}
                      onChange={(event) => handleAuthFieldChange('department', event.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                      placeholder="Academic Affairs"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => handleAuthFieldChange('email', event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                placeholder="name@college.edu"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-slate-300">Password</label>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => handleAuthFieldChange('password', event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                placeholder="Enter password"
                required
              />
            </div>

            {authError && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{authError}</div>}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full rounded-full bg-sky-500 px-4 py-3 font-medium text-slate-100 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authBusy ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell min-h-screen bg-slate-950 text-slate-100 ${preferences.compactMode ? 'app-density-compact' : ''}`}>
      <div className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          <aside className="rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-lg shadow-orange-950/5 xl:sticky xl:top-6 xl:flex xl:h-[calc(100vh-3rem)] xl:w-64 xl:shrink-0 xl:flex-col">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-slate-100">EduPulse</p>
                <p className="text-xs text-slate-400">Campus intelligence</p>
              </div>
            </div>
            <div className="my-4 hidden border-t border-slate-700 xl:block" />
            <p className="mb-2 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 xl:block">Workspace</p>
            <nav aria-label="Main navigation" className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-4 xl:flex xl:flex-1 xl:flex-col">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className={`inline-flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    activeTab === id
                      ? 'bg-sky-100 text-sky-800 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] ${activeTab === id ? 'text-sky-700' : 'text-slate-400'}`} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="mt-4 hidden rounded-2xl bg-slate-800 p-3 xl:block">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${health?.model_loaded ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-xs font-medium text-slate-200">{health?.model_loaded ? 'Services operational' : 'Connecting to services'}</span>
              </div>
              <p className="mt-1 pl-4 text-[11px] text-slate-400">{modelInfo?.model_name || 'Model status unavailable'}</p>
            </div>
            <div className="mt-4 hidden border-t border-slate-700 pt-3 xl:block">
              <p className="truncate text-xs font-medium text-slate-300">{currentUser?.email}</p>
              <p className="mt-1 text-[11px] text-slate-400">Institutional account</p>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
        <header className="mb-6 flex flex-col gap-5 rounded-3xl border border-slate-700 bg-slate-900/95 p-5 shadow-lg shadow-orange-950/5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">{currentUser?.department || 'Institutional analytics'}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
                {tabs.find((tab) => tab.id === activeTab)?.label || 'Campus overview'}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {activeDepartmentCount} {activeDepartmentCount === 1 ? 'department' : 'departments'} · {activeUserCount} {activeUserCount === 1 ? 'active user' : 'active users'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 sm:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-300">
                  {(currentUser?.full_name || 'U').split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{currentUser?.full_name || 'College User'}</p>
                  <p className="text-xs capitalize text-slate-400">{currentUser?.role || 'faculty'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadApiState()}
                aria-label="Refresh dashboard data"
                className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-300 transition hover:border-sky-500 hover:text-slate-100"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => void toggleNotifications()}
                  aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
                  aria-expanded={notificationsOpen}
                  className="relative rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-300 transition hover:border-sky-500 hover:text-slate-100"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d98a68] px-1 text-[10px] font-bold text-white">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-14 z-30 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
                    <div className="flex items-center justify-between px-2 py-1">
                      <h2 className="font-semibold text-slate-100">Notifications</h2>
                      <span className="text-xs text-slate-400">{unreadNotifications} unread</span>
                    </div>
                    {notificationError && <p role="alert" className="m-2 rounded-lg bg-red-100 p-2 text-xs text-red-800">{notificationError}</p>}
                    <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                      {notifications.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (!item.is_read) void handleMarkNotificationRead(item.id);
                            setNotificationsOpen(false);
                            setActiveTab('feedback');
                          }}
                          className={`block w-full rounded-xl p-3 text-left ${item.is_read ? 'bg-slate-800/60' : 'bg-sky-50'} hover:ring-1 hover:ring-sky-300`}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-100">{item.title}</span>
                            {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#d98a68]" />}
                          </span>
                          <span className="mt-1 block text-xs text-slate-400">{item.message}</span>
                          <span className="mt-2 block text-[10px] text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
                        </button>
                      ))}
                      {!notifications.length && !notificationError && <p className="p-5 text-center text-sm text-slate-400">You are all caught up.</p>}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Model</p>
              <p className="mt-2 text-lg font-semibold text-white">{modelInfo?.model_name || 'Loading…'}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Version</p>
              <p className="mt-2 text-lg font-semibold text-white">{modelInfo?.version || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Review threshold</p>
              <p className="mt-2 text-lg font-semibold text-white">{modelInfo ? Number(modelInfo.review_threshold).toFixed(2) : '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Top feedback area</p>
              <p className="mt-2 text-lg font-semibold text-sky-300">{topCategory}</p>
            </div>
          </div>
        </header>

        {dataError && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <span>{dataError}</span>
            <button type="button" onClick={() => void loadApiState()} className="font-semibold underline">Retry</button>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <p className="text-sm text-slate-400">Feedback analyzed</p>
                <p className="mt-3 text-4xl font-bold text-white">{Number(analytics?.total_feedback || 0).toLocaleString()}</p>
                <p className="mt-2 text-sm text-slate-400">Across all submission sources</p>
              </div>
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <p className="text-sm text-slate-400">Awaiting review</p>
                <p className="mt-3 text-4xl font-bold text-amber-300">{Number(analytics?.pending_reviews || 0).toLocaleString()}</p>
                <p className="mt-2 text-sm text-slate-400">Low-confidence predictions</p>
              </div>
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <p className="text-sm text-slate-400">Resolved reviews</p>
                <p className="mt-3 text-4xl font-bold text-emerald-300">{Number(analytics?.resolved_reviews || 0).toLocaleString()}</p>
                <p className="mt-2 text-sm text-slate-400">Closed by your review team</p>
              </div>
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <p className="text-sm text-slate-400">Average model confidence</p>
                <p className="mt-3 text-4xl font-bold text-white">{`${(Number(analytics?.average_confidence || 0) * 100).toFixed(0)}%`}</p>
                <p className="mt-2 text-sm text-slate-400">From saved predictions</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Submission activity</h2>
                    <p className="mt-1 text-sm text-slate-400">Feedback received over the last seven days</p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-sky-300" />
                </div>
                <div className="mt-6 h-80">
                  {dailyTrend.some((item: any) => item.count > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ead8c7" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: '#88776a', fontSize: 11 }} tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                        <YAxis allowDecimals={false} tick={{ fill: '#88776a' }} />
                        <Tooltip contentStyle={{ background: '#fffdf9', borderColor: '#ead8c7', borderRadius: 12, color: '#352c25' }} />
                        <Bar dataKey="count" name="Feedback" fill="#d98a68" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-400">Activity will appear after feedback is submitted.</div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Institutional insights</h2>
                  <ShieldAlert className="h-5 w-5 text-violet-300" />
                </div>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Highest-volume category</p>
                    <p className="mt-2 text-xl font-semibold text-white">{topCategory}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Feedback requiring attention</p>
                    <p className="mt-2 text-white">{Number(analytics?.pending_reviews || 0)} item(s) are waiting for a human review.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Model status</p>
                    <p className="mt-2 text-white">{health?.model_loaded ? 'Classification service is ready.' : 'Classification service is unavailable.'}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Upload and batch analyzer</h2>
              <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sky-500/60 bg-slate-800 p-10 text-center transition hover:border-sky-400 hover:bg-slate-800/90">
                <UploadCloud className="h-10 w-10 text-sky-300" />
                <span className="mt-3 text-lg font-medium text-slate-200">Drag and drop or select a CSV/Excel file</span>
                <span className="mt-2 text-sm text-slate-400">Expected column: feedback</span>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUploadFile} />
              </label>
              {fileName && <p className="mt-4 text-sm text-slate-300">Selected file: {fileName}</p>}
              {uploading && <p className="mt-4 text-sm text-amber-300">Uploading and classifying…</p>}
              {uploadError && <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{uploadError}</p>}
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Batch summary</h2>
              {batchSummary ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-800 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Rows</p>
                      <p className="mt-2 text-2xl font-bold text-white">{batchSummary.total_rows}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-800 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Human review</p>
                      <p className="mt-2 text-2xl font-bold text-amber-300">{batchSummary.human_review_count}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-800 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Primary area</p>
                      <p className="mt-2 text-lg font-bold text-sky-300">{primaryCategory}</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-700">
                    <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
                      <thead className="bg-slate-800 text-slate-300">
                        <tr>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700 bg-slate-900">
                        {Object.entries(batchCategories).map(([key, value]) => (
                          <tr key={key} className="text-slate-200">
                            <td className="px-4 py-3">{key}</td>
                            <td className="px-4 py-3">{String(value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={downloadBatchCsv}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500 hover:text-white"
                  >
                    <Download className="h-4 w-4" /> Download classified CSV
                  </button>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-300">No uploaded batch analyzed yet.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
              <div className="report-filters flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="analytics-start" className="mb-1 block text-xs font-medium text-slate-400">From</label>
                  <input id="analytics-start" type="date" value={analyticsFilters.startDate} onChange={(event) => setAnalyticsFilters((filters) => ({ ...filters, startDate: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label htmlFor="analytics-end" className="mb-1 block text-xs font-medium text-slate-400">To</label>
                  <input id="analytics-end" type="date" value={analyticsFilters.endDate} onChange={(event) => setAnalyticsFilters((filters) => ({ ...filters, endDate: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label htmlFor="analytics-category" className="mb-1 block text-xs font-medium text-slate-400">Category</label>
                  <select id="analytics-category" value={analyticsFilters.category} onChange={(event) => setAnalyticsFilters((filters) => ({ ...filters, category: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="">All categories</option>
                    {Object.keys(analytics?.category_counts || {}).map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="analytics-source" className="mb-1 block text-xs font-medium text-slate-400">Source</label>
                  <select id="analytics-source" value={analyticsFilters.source} onChange={(event) => setAnalyticsFilters((filters) => ({ ...filters, source: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="">All sources</option>
                    <option value="single">Individual analysis</option>
                    <option value="batch">Batch upload</option>
                    <option value="survey">Survey</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="analytics-department" className="mb-1 block text-xs font-medium text-slate-400">Department</label>
                  <select id="analytics-department" value={analyticsFilters.department} onChange={(event) => setAnalyticsFilters((filters) => ({ ...filters, department: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    <option value="">All departments</option>
                    {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => void downloadFeedbackReport()} className="no-print inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-sky-400">
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                <button type="button" onClick={() => window.print()} className="no-print rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-sky-500">Print / Save PDF</button>
                <button type="button" onClick={() => setAnalyticsFilters({ startDate: '', endDate: '', category: '', source: '', department: '' })} className="no-print rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-sky-500">Clear filters</button>
              </div>
              <p className="mt-3 text-xs text-slate-400">Reports include feedback text. Store downloaded files according to your institution's privacy policy.</p>
            </section>
            <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Distribution by category</h2>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={40} paddingAngle={2}>
                      {pieData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Concern volume</h2>
              <div className="mt-4 h-80">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pieData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ead8c7" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#6d5e52', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} tick={{ fill: '#6d5e52' }} />
                      <Tooltip contentStyle={{ background: '#fffdf9', borderColor: '#ead8c7', borderRadius: 12, color: '#352c25' }} />
                      <Bar dataKey="value" name="Feedback count" radius={[8, 8, 0, 0]} fill="#e5ca58" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-400">No categorized feedback yet.</div>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 lg:col-span-2">
              <h2 className="text-xl font-semibold text-white">{analyticsFilters.startDate || analyticsFilters.endDate ? 'Submission trend for selected period' : 'Seven-day submission trend'}</h2>
              <div className="mt-4 h-72">
                {dailyTrend.some((item: any) => item.count > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ead8c7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#88776a', fontSize: 11 }} tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                      <YAxis allowDecimals={false} tick={{ fill: '#88776a' }} />
                      <Tooltip contentStyle={{ background: '#fffdf9', borderColor: '#ead8c7', borderRadius: 12, color: '#352c25' }} />
                      <Bar dataKey="count" name="Feedback" fill="#d98a68" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-400">No feedback received during this period.</div>
                )}
              </div>
            </div>
          </div>
          </div>
        )}

        {activeTab === 'model' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Accuracy</p>
                <p className="mt-2 text-3xl font-bold text-white">{modelMetrics.accuracy == null ? '—' : `${(Number(modelMetrics.accuracy) * 100).toFixed(1)}%`}</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Macro F1</p>
                <p className="mt-2 text-3xl font-bold text-white">{modelMetrics.macro_f1 == null ? '—' : `${(Number(modelMetrics.macro_f1) * 100).toFixed(1)}%`}</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Weighted F1</p>
                <p className="mt-2 text-3xl font-bold text-white">{modelMetrics.weighted_f1 == null ? '—' : `${(Number(modelMetrics.weighted_f1) * 100).toFixed(1)}%`}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Held-out model comparison</h2>
              <p className="mt-1 text-sm text-slate-400">Evaluation metrics from the training dataset test split.</p>
              <div className="mt-5 h-72">
                {categoryChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ead8c7" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#6d5e52', fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tick={{ fill: '#88776a' }} />
                      <Tooltip contentStyle={{ background: '#fffdf9', borderColor: '#ead8c7', borderRadius: 12, color: '#352c25' }} />
                      <Bar dataKey="accuracy" name="Accuracy" fill="#d98a68" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="macroF1" name="Macro F1" fill="#e5ca58" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">Model comparison metrics are unavailable.</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Per-class precision, recall and F1</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700">
                <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Precision</th>
                      <th className="px-4 py-3">Recall</th>
                      <th className="px-4 py-3">F1</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700 bg-slate-900">
                    {Object.entries((modelMetrics?.per_class || {}) as Record<string, { precision?: number; recall?: number; f1?: number }>).map(([label, values]) => (
                      <tr key={label} className="text-slate-200">
                        <td className="px-4 py-3">{label}</td>
                        <td className="px-4 py-3">{Number(values.precision || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(values.recall || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">{Number(values.f1 || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Object.keys(modelMetrics?.per_class || {}).length === 0 && (
                <p className="mt-4 text-sm text-slate-400">Model evaluation metrics are not available.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analyzer' && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Individual feedback analyzer</h2>
              <textarea
                value={singleText}
                onChange={(event) => setSingleText(event.target.value)}
                rows={8}
                maxLength={10000}
                className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-100 outline-none ring-0 transition focus:border-sky-400"
                placeholder="Type a student feedback message..."
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>Predictions are saved to institutional analytics.</span>
                <span>{singleText.length}/10000</span>
              </div>
              {predictionError && <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{predictionError}</p>}
              <button
                type="button"
                onClick={handleSinglePredict}
                disabled={predictionBusy || !singleText.trim()}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 font-medium text-slate-100 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {predictionBusy ? 'Analyzing…' : 'Analyze feedback'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold text-white">Prediction result</h2>
              {singleResult ? (
                <div className="mt-5 space-y-4 text-sm text-slate-300">
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-slate-400">Predicted category</p>
                    <p className="mt-2 text-2xl font-bold text-sky-300">{singleResult.predicted_category}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-slate-400">Confidence</p>
                    <p className="mt-2 text-xl font-semibold text-white">{(Number(singleResult.confidence) * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-slate-400">Alternative categories</p>
                    <p className="mt-2 text-white">{singleResult.alternatives?.join(', ') || 'No alternatives available.'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-slate-400">Influential features</p>
                    <p className="mt-2 text-white">{singleResult.influential_features.join(', ') || 'No strong lexical indicators available.'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-slate-400">Recommendation</p>
                    <p className="mt-2 text-white">{singleResult.recommendation}</p>
                  </div>
                  {singleResult.human_review && (
                    <div className="rounded-2xl border border-amber-500/60 bg-amber-500/10 p-4 text-amber-200">Needs Human Review</div>
                  )}
                </div>
              ) : (
                <p className="mt-5 text-slate-400">Submit a message to generate a prediction.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'feedback' && (
          <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-sky-300">Institutional workflow</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Feedback & review queue</h2>
                <p className="mt-2 text-sm text-slate-400">Assign reviews to yourself, set a deadline, add notes, and track resolution history.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={feedbackSearch}
                  onChange={(event) => setFeedbackSearch(event.target.value)}
                  aria-label="Search feedback text"
                  placeholder="Search feedback…"
                  className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400"
                />
                <select
                  value={feedbackFilter}
                  onChange={(event) => setFeedbackFilter(event.target.value)}
                  aria-label="Filter review status"
                  className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400"
                >
                  <option value="pending">Awaiting review</option>
                  <option value="all">All feedback</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
            </div>
            {feedbackError && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{feedbackError}</p>}
            <div className="mt-6 space-y-3">
              {feedbackItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-200">{item.predicted_category}</span>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-100">{item.feedback}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${item.review_status === 'pending' ? 'bg-amber-500/10 text-amber-200' : item.review_status === 'resolved' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                      {item.review_status === 'not_required' ? 'No review required' : item.review_status}
                    </span>
                  </div>
                  {item.human_review && (
                    <div className="mt-4 grid gap-3 rounded-xl bg-slate-900/70 p-4 md:grid-cols-[1fr_auto]">
                      <div>
                        <label htmlFor={`review-note-${item.id}`} className="mb-1 block text-xs font-medium text-slate-400">Internal review notes</label>
                        <textarea
                          id={`review-note-${item.id}`}
                          value={reviewNotes[item.id] ?? item.review_notes ?? ''}
                          onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                          maxLength={5000}
                          rows={2}
                          className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100 outline-none focus:border-sky-400"
                          placeholder="Record the action taken or follow-up needed…"
                        />
                        <button type="button" onClick={() => void handleSaveReviewNotes(item.id)} className="mt-2 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500">Save notes</button>
                      </div>
                      <div className="flex flex-col justify-end gap-2">
                        <label htmlFor={`review-due-${item.id}`} className="text-xs font-medium text-slate-400">Due date</label>
                        <input
                          id={`review-due-${item.id}`}
                          type="datetime-local"
                          value={reviewDueDates[item.id] ?? (item.due_at ? new Date(item.due_at).toISOString().slice(0, 16) : '')}
                          onChange={(event) => setReviewDueDates((current) => ({ ...current, [item.id]: event.target.value }))}
                          className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                        />
                        <button type="button" onClick={() => void handleAssignReview(item.id)} disabled={item.review_status !== 'pending'} className="rounded-xl border border-sky-500/60 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                          {item.assigned_to ? 'Update my assignment' : 'Assign to me'}
                        </button>
                        {item.assigned_to && <p className="text-right text-xs text-slate-400">Assigned to {item.assigned_to}</p>}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
                    <p className="text-xs text-slate-400">
                      Confidence {(Number(item.confidence) * 100).toFixed(1)}% · {item.source} · {new Date(item.created_at).toLocaleString()}
                    </p>
                    {item.human_review && (
                      <div className="flex flex-wrap gap-2">
                        {item.review_status !== 'resolved' && (
                          <button type="button" onClick={() => void handleReviewUpdate(item.id, 'resolved')} className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-200">Mark resolved</button>
                        )}
                        {item.review_status !== 'pending' && (
                          <button type="button" onClick={() => void handleReviewUpdate(item.id, 'pending')} className="rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-sky-500">Reopen</button>
                        )}
                        {item.review_status === 'pending' && (
                          <button type="button" onClick={() => void handleReviewUpdate(item.id, 'dismissed')} className="rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-400">Dismiss</button>
                        )}
                        <button type="button" aria-expanded={!!openReviewHistory[item.id]} onClick={() => void toggleReviewHistory(item.id)} className="rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-sky-500">
                          {openReviewHistory[item.id] ? 'Hide activity' : 'View activity'}
                        </button>
                      </div>
                    )}
                  </div>
                  {openReviewHistory[item.id] && (
                    <ol aria-label={`Review activity for feedback ${item.id}`} className="mt-3 space-y-2 border-l-2 border-slate-600 pl-4">
                      {(reviewActivities[item.id] || []).map((activity, index) => (
                        <li key={`${activity.created_at}-${index}`} className="text-xs text-slate-400">
                          <span className="font-semibold text-slate-200">{activity.action.replaceAll('_', ' ')}</span> · {activity.actor} · {new Date(activity.created_at).toLocaleString()}
                          {activity.details && <p className="mt-1">{activity.details}</p>}
                        </li>
                      ))}
                      {reviewActivities[item.id]?.length === 0 && <li className="text-xs text-slate-400">No review activity has been recorded.</li>}
                    </ol>
                  )}
                </article>
              ))}
              {feedbackItems.length === 0 && !feedbackError && (
                <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center">
                  <MessageSquareText className="mx-auto h-8 w-8 text-slate-500" />
                  <p className="mt-3 font-medium text-slate-200">No feedback matches this view</p>
                  <p className="mt-1 text-sm text-slate-400">Predictions and public survey submissions will appear here.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'form' && (
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <p className="text-sm font-medium text-violet-300">Collect feedback directly into your analytics</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Survey builder</h2>
            <p className="mt-2 text-sm text-slate-400">Start from a reusable template, set an optional response limit or closing time, and track submissions.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="survey-title" className="mb-2 block text-sm font-medium text-slate-300">Survey title</label>
                <input
                  id="survey-title"
                  value={formTitle}
                  onChange={(event) => setFormTitle(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                  placeholder="Example: Campus Facilities Satisfaction"
                />
              </div>
              <div>
                <label htmlFor="survey-template" className="mb-2 block text-sm font-medium text-slate-300">Template</label>
                <select id="survey-template" value={surveyTemplate} onChange={(event) => {
                  const nextTemplate = event.target.value as keyof typeof SURVEY_TEMPLATES;
                  setSurveyTemplate(nextTemplate);
                  setSurveyPrompt(SURVEY_TEMPLATES[nextTemplate].prompt);
                }} className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100">
                  {Object.entries(SURVEY_TEMPLATES).map(([key, template]) => <option key={key} value={key}>{template.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="survey-prompt" className="mb-2 block text-sm font-medium text-slate-300">Question or introduction</label>
                <textarea id="survey-prompt" value={surveyPrompt} onChange={(event) => setSurveyPrompt(event.target.value)} maxLength={500} rows={3} className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400" />
              </div>
              <div>
                <label htmlFor="survey-limit" className="mb-2 block text-sm font-medium text-slate-300">Response limit (optional)</label>
                <input id="survey-limit" type="number" min="1" max="10000" value={surveyMaxResponses} onChange={(event) => setSurveyMaxResponses(event.target.value)} placeholder="No limit" className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100" />
              </div>
              <div>
                <label htmlFor="survey-close" className="mb-2 block text-sm font-medium text-slate-300">Closing date and time (optional)</label>
                <input id="survey-close" type="datetime-local" value={surveyClosesAt} onChange={(event) => setSurveyClosesAt(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100" />
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">Survey responses and their review notes are automatically deleted after 90 days. Students must consent before submitting.</p>
            {surveyError && <p role="alert" className="mt-4 rounded-xl bg-red-100 p-3 text-sm text-red-800">{surveyError}</p>}
            <button
              type="button"
              onClick={() => void handleGenerateLink()}
              disabled={surveyBusy || !formTitle.trim() || !surveyPrompt.trim()}
              className="mt-5 rounded-full bg-sky-500 px-5 py-3 font-medium text-slate-100 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {surveyBusy ? 'Creating survey…' : 'Create survey link'}
            </button>
            {generatedLink && (
              <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-200">
                <p className="text-sm text-slate-400">Shareable survey URL</p>
                <a href={generatedLink} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm font-medium text-sky-300 hover:text-sky-200">{generatedLink}</a>
                <button type="button" onClick={() => void handleCopyLink()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-sky-500">
                  <ClipboardCopy className="h-4 w-4" /> {linkCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            )}
            <div className="mt-8 border-t border-slate-700 pt-6">
              <h3 className="text-lg font-semibold text-slate-100">Recent surveys</h3>
              <div className="mt-3 space-y-3">
                {surveys.map((survey) => (
                  <article key={survey.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800 p-4">
                    <div>
                      <p className="font-medium text-slate-100">{survey.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{survey.response_count} response(s){survey.max_responses ? ` of ${survey.max_responses}` : ''}{survey.closes_at ? ` · closes ${new Date(survey.closes_at).toLocaleString()}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${survey.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-700 text-slate-300'}`}>{survey.status}</span>
                      <a href={`${window.location.origin}/?survey=${encodeURIComponent(survey.id)}&title=${encodeURIComponent(survey.title)}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-sky-700 hover:underline">Open survey</a>
                    </div>
                  </article>
                ))}
                {surveys.length === 0 && !surveyError && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No saved surveys yet.</p>}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'settings' && (
          <section className="space-y-5">
            <div>
              <p className="text-sm font-medium text-violet-300">Personalize your workspace</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-100">Settings</h2>
              <p className="mt-2 text-sm text-slate-400">These preferences are saved in this browser and do not change institutional data.</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-100 p-2.5 text-amber-300"><Sparkles className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Appearance</h3>
                    <p className="mt-1 text-sm text-slate-400">A soft, warm palette for a calmer analytics workspace.</p>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-3" aria-label="Powder, peach, and lemon color palette">
                  <span className="h-10 w-10 rounded-full border border-slate-700 bg-[#f5e8dc]" title="Powder" />
                  <span className="h-10 w-10 rounded-full border border-slate-700 bg-[#e9a17f]" title="Peach" />
                  <span className="h-10 w-10 rounded-full border border-slate-700 bg-[#f1df83]" title="Lemon" />
                  <span className="h-10 w-10 rounded-full border border-slate-700 bg-[#faf6ef]" title="Warm cream" />
                  <p className="ml-2 text-sm text-slate-300">Powder · peach · lemon</p>
                </div>
                <label className="mt-7 flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-slate-800 p-4">
                  <span>
                    <span className="block text-sm font-medium text-slate-100">Compact layout</span>
                    <span className="mt-1 block text-xs text-slate-400">Reduce card spacing to fit more on screen.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.compactMode}
                    onChange={(event) => setPreferences((current) => ({ ...current, compactMode: event.target.checked }))}
                    className="h-5 w-5 accent-[#d98a68]"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700"><RefreshCw className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-semibold text-slate-100">Data refresh</h3>
                    <p className="mt-1 text-sm text-slate-400">Choose how often dashboard analytics are refreshed.</p>
                  </div>
                </div>
                <label className="mt-6 block text-sm font-medium text-slate-300" htmlFor="refresh-interval">Automatic refresh</label>
                <select
                  id="refresh-interval"
                  value={preferences.refreshInterval}
                  onChange={(event) => setPreferences((current) => ({ ...current, refreshInterval: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 p-3 text-slate-100 outline-none focus:border-sky-400"
                >
                  <option value={0}>Off</option>
                  <option value={1}>Every minute</option>
                  <option value={5}>Every 5 minutes</option>
                  <option value={15}>Every 15 minutes</option>
                </select>
                <p className="mt-3 text-xs text-slate-400">You can always refresh immediately with the refresh button above.</p>
                <button
                  type="button"
                  onClick={() => setPreferences(DEFAULT_PREFERENCES)}
                  className="mt-5 rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-sky-500 hover:text-slate-100"
                >
                  Restore default settings
                </button>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 lg:col-span-2">
                <h3 className="font-semibold text-slate-100">Account</h3>
                <p className="mt-1 text-sm text-slate-400">Currently signed in institutional account.</p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Name</dt>
                    <dd className="mt-1 font-medium text-slate-100">{currentUser?.full_name || '—'}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
                    <dd className="mt-1 break-all font-medium text-slate-100">{currentUser?.email || '—'}</dd>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Role & department</dt>
                    <dd className="mt-1 font-medium capitalize text-slate-100">{currentUser?.role || '—'} · {currentUser?.department || '—'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <h3 className="font-semibold text-slate-100">Privacy and retention</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">Student feedback, survey responses, and associated review notes are automatically deleted after 90 days. Audit entries retain action metadata only and do not store feedback text.</p>
                <p className="mt-3 rounded-xl bg-amber-100 p-3 text-xs leading-5 text-amber-900">CSV exports contain feedback text and may include sensitive information. Keep exported files in approved institutional storage.</p>
                <p className="mt-3 text-xs text-slate-500">Retention cleanup runs automatically when the API starts and hourly while it is running.</p>
              </div>

              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
                <h3 className="font-semibold text-slate-100">Recent audit history</h3>
                <p className="mt-1 text-xs text-slate-400">Latest 50 system actions; feedback text is not included.</p>
                {auditError && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-2 text-xs text-red-800">{auditError}</p>}
                <ol className="mt-4 max-h-72 space-y-3 overflow-y-auto">
                  {auditEvents.map((event, index) => (
                    <li key={`${event.created_at}-${index}`} className="border-l-2 border-slate-600 pl-3">
                      <p className="text-xs font-medium text-slate-200">{event.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{event.actor} · {new Date(event.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                  {auditEvents.length === 0 && !auditError && <li className="text-sm text-slate-400">No audited actions yet.</li>}
                </ol>
              </div>
            </div>
          </section>
        )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
