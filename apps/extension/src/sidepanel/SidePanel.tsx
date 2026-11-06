import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Navbar } from '../components/Navbar.js';
import { AuthView } from '../components/AuthView.js';
import { OverviewView } from './views/OverviewView.js';
import { ProjectsView } from './views/ProjectsView.js';
import { TasksView } from './views/TasksView.js';
import { SubmissionsView } from './views/SubmissionsView.js';
import { PaymentsView } from './views/PaymentsView.js';
import { ActivityView } from './views/ActivityView.js';
import { SettingsView } from './views/SettingsView.js';
import {
  LayoutDashboard,
  FolderGit2,
  CheckSquare,
  GitPullRequest,
  CreditCard,
  Activity,
  Settings
} from 'lucide-react';

type SectionKey = 'overview' | 'projects' | 'tasks' | 'submissions' | 'payments' | 'activity' | 'settings';

export const SidePanel: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: '2rem', height: '2rem', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <AuthView />
      </div>
    );
  }

  const navItems = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'projects', label: 'Projects', icon: FolderGit2 },
    { key: 'tasks', label: 'Tasks', icon: CheckSquare },
    { key: 'submissions', label: 'PRs', icon: GitPullRequest },
    { key: 'payments', label: 'Escrow', icon: CreditCard },
    { key: 'activity', label: 'Audit', icon: Activity },
    { key: 'settings', label: 'Settings', icon: Settings }
  ] as const;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Top App Navbar */}
      <Navbar />

      {/* Primary Section Tab Navigation Bar */}
      <nav
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          overflowX: 'auto',
          padding: '0 0.5rem',
          scrollbarWidth: 'none'
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.65rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--accent-blue)' : 'transparent'}`,
                backgroundColor: 'transparent',
                color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Section View Content Body */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem'
        }}
      >
        {activeSection === 'overview' && <OverviewView onNavigate={(sec) => setActiveSection(sec as SectionKey)} />}
        {activeSection === 'projects' && <ProjectsView />}
        {activeSection === 'tasks' && <TasksView />}
        {activeSection === 'submissions' && <SubmissionsView />}
        {activeSection === 'payments' && <PaymentsView />}
        {activeSection === 'activity' && <ActivityView />}
        {activeSection === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};
