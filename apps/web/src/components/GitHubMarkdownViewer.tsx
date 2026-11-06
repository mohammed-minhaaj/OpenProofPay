import React, { useState } from 'react';
import { ExternalLink, Maximize2, X, Image as ImageIcon } from 'lucide-react';

interface GitHubMarkdownViewerProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

export const GitHubMarkdownViewer: React.FC<GitHubMarkdownViewerProps> = ({ content, style }) => {
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  if (!content || content.trim().length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' }}>No content provided.</div>;
  }

  const handleImageError = (url: string) => {
    setFailedImages((prev) => ({ ...prev, [url]: true }));
  };

  // Convert GitHub image URL to secure proxy URL if it is a GitHub user-attachment
  const resolveImageUrl = (url: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    if (
      trimmed.includes('github.com/user-attachments/assets/') ||
      trimmed.includes('user-images.githubusercontent.com') ||
      trimmed.includes('private-user-images.githubusercontent.com')
    ) {
      return `/api/github/image-proxy?url=${encodeURIComponent(trimmed)}`;
    }
    return trimmed;
  };

  // Tokenize and render markdown content with image recognition
  const renderFormattedMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockBuffer: string[] = [];
    let codeBlockLang = '';

    lines.forEach((line, lineIdx) => {
      // Code block start / end
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${lineIdx}`}
              data-language={codeBlockLang || undefined}
              style={{
                backgroundColor: 'var(--bg-sidebar)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '12px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
                margin: '10px 0'
              }}
            >
              <code>{codeBlockBuffer.join('\n')}</code>
            </pre>
          );
          codeBlockBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeBlockLang = line.trim().slice(3);
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockBuffer.push(line);
        return;
      }

      // Check for standalone HTML <img> tags
      const imgTagMatch = line.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*alt=["']?([^"']*)["']?[^>]*\/?>/i);
      if (imgTagMatch) {
        const rawSrc = imgTagMatch[1]!;
        const alt = imgTagMatch[2] || 'GitHub Screenshot';
        const resolvedSrc = resolveImageUrl(rawSrc);

        elements.push(
          <div key={`img-tag-${lineIdx}`} style={{ margin: '14px 0' }}>
            {failedImages[rawSrc] ? (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--status-warning-bg)',
                  border: '1px solid var(--status-warning-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={16} color="var(--status-warning)" />
                  <span>Image attachment: {alt || 'Screenshot'}</span>
                </div>
                <a
                  href={rawSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary-accent)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                >
                  Open link <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                <img
                  src={resolvedSrc}
                  alt={alt}
                  onError={() => handleImageError(rawSrc)}
                  onClick={() => setSelectedImage({ url: resolvedSrc, alt })}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '450px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    border: '1px solid var(--card-border)',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'zoom-in',
                    display: 'block'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSelectedImage({ url: resolvedSrc, alt })}
                  title="Enlarge screenshot"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '4px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <Maximize2 size={13} />
                </button>
              </div>
            )}
          </div>
        );
        return;
      }

      // Check for Markdown images: ![alt](url)
      const mdImgMatch = line.match(/!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
      if (mdImgMatch) {
        const alt = mdImgMatch[1] || 'GitHub Screenshot';
        const rawSrc = mdImgMatch[2]!;
        const resolvedSrc = resolveImageUrl(rawSrc);

        elements.push(
          <div key={`md-img-${lineIdx}`} style={{ margin: '14px 0' }}>
            {failedImages[rawSrc] ? (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={16} color="var(--accent-amber)" />
                  <span>Image attachment: {alt || 'Screenshot'}</span>
                </div>
                <a
                  href={rawSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                >
                  Open external <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                <img
                  src={resolvedSrc}
                  alt={alt}
                  onError={() => handleImageError(rawSrc)}
                  onClick={() => setSelectedImage({ url: resolvedSrc, alt })}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '450px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    cursor: 'zoom-in',
                    display: 'block'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSelectedImage({ url: resolvedSrc, alt })}
                  title="Enlarge screenshot"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '4px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <Maximize2 size={13} />
                </button>
              </div>
            )}
          </div>
        );
        return;
      }

      // Headers
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={`h3-${lineIdx}`} style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px 0' }}>
            {line.slice(4)}
          </h4>
        );
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={`h2-${lineIdx}`} style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px 0' }}>
            {line.slice(3)}
          </h3>
        );
        return;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={`h1-${lineIdx}`} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '18px 0 10px 0' }}>
            {line.slice(2)}
          </h2>
        );
        return;
      }

      // Checkboxes: - [ ] or - [x]
      const checkboxMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
      if (checkboxMatch) {
        const isChecked = checkboxMatch[1]?.toLowerCase() === 'x';
        elements.push(
          <div key={`chk-${lineIdx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0', fontSize: '13px' }}>
            <input type="checkbox" checked={isChecked} readOnly style={{ accentColor: 'var(--accent-blue)', cursor: 'default' }} />
            <span style={{ color: isChecked ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: isChecked ? 'line-through' : 'none' }}>
              {checkboxMatch[2]}
            </span>
          </div>
        );
        return;
      }

      // Bullet list items
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        elements.push(
          <div key={`li-${lineIdx}`} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '3px 0', fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--accent-blue)', fontSize: '10px' }}>•</span>
            <span>{line.trim().slice(2)}</span>
          </div>
        );
        return;
      }

      // Empty line / paragraph spacer
      if (!line.trim()) {
        elements.push(<div key={`sp-${lineIdx}`} style={{ height: '8px' }} />);
        return;
      }

      // Normal text with inline markdown bold/code support
      elements.push(
        <p key={`p-${lineIdx}`} style={{ margin: '4px 0', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-primary)' }}>
          {line}
        </p>
      );
    });

    return elements;
  };

  return (
    <div style={{ ...style }}>
      {renderFormattedMarkdown(content)}

      {/* Lightbox / Modal for Enlarged Screenshots */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <button
              onClick={() => setSelectedImage(null)}
              style={{
                position: 'absolute',
                top: '-36px',
                right: '0',
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px'
              }}
            >
              <X size={20} /> Close
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
              }}
            />
            {selectedImage.alt && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                {selectedImage.alt}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
