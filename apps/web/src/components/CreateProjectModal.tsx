import React, { useState } from 'react';
import { webApi } from '../services/api.js';
import { Layers, X } from 'lucide-react';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  onClose,
  onSuccess
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [totalBudget, setTotalBudget] = useState('2000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await webApi.createProject({
        title: name.trim(),
        description: description.trim() || undefined,
        githubRepo: githubRepo.trim() || undefined,
        totalBudget: Number(totalBudget) || 0,
        currency: 'USD'
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '480px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--card-bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} style={{ color: 'var(--accent-blue)' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
              Create New Engineering Project
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. OpenProofPay Extension MVP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Project purpose, scope, and target repository..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Linked GitHub Repository (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. mohammed-minhaaj/extension or https://github.com/org/repo"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
              Links this workspace to a repository for PR verification and issues
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Total Budget ($ USD)
            </label>
            <input
              type="number"
              min="0"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'var(--accent-blue)',
                border: 'none',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
