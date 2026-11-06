import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient.js';
import { Skeleton } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Modal } from '../../components/Modal.js';
import { FolderGit2, Plus, DollarSign, Calendar, Loader2 } from 'lucide-react';

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  status: string;
  totalBudget: number;
  currency: string;
  createdAt: string;
}

export const ProjectsView: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [githubRepoId, setGithubRepoId] = useState('');
  const [totalBudget, setTotalBudget] = useState('500');

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await apiClient.listProjects();
      setProjects(res.data || []);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await apiClient.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        githubRepoId: githubRepoId.trim() || 'repo-general',
        totalBudget: parseFloat(totalBudget) || 0
      });
      setIsModalOpen(false);
      setName('');
      setDescription('');
      fetchProjects();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="4.5rem" count={3} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Workspaces & Repositories
          </h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Organize task milestones and escrow budgets by repository.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.4rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'var(--accent-blue)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={14} /> New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects configured"
          description="Create your first project workspace to start funding GitHub issues with verified milestone payments."
          icon={FolderGit2}
          actionLabel="Create Project"
          onAction={() => setIsModalOpen(true)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {projects.map((proj) => (
            <div
              key={proj.id}
              style={{
                padding: '1rem',
                borderRadius: '0.65rem',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FolderGit2 size={16} color="var(--accent-blue)" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {proj.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.1rem 0.4rem',
                    borderRadius: '0.25rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981'
                  }}
                >
                  {proj.status}
                </span>
              </div>

              {proj.description && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {proj.description}
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '0.5rem',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <DollarSign size={13} color="#10b981" />
                  <span>Budget: ${proj.totalBudget} {proj.currency}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Calendar size={13} />
                  <span>{new Date(proj.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Project */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Project">
        {error && (
          <div style={{ padding: '0.5rem', borderRadius: '0.375rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Project Title
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PayPal Payment Gateway Integration"
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe milestone objectives and deliverables..."
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Target GitHub Repo Identifier
            </label>
            <input
              type="text"
              value={githubRepoId}
              onChange={(e) => setGithubRepoId(e.target.value)}
              placeholder="e.g. openproofpay/core-engine"
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Allocated Budget (USD)
            </label>
            <input
              type="number"
              min="0"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: 'var(--accent-blue)',
                color: '#ffffff',
                border: 'none',
                cursor: creating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create Workspace'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
