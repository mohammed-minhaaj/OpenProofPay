import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width = '100%',
  height = '1rem',
  count = 1
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded ${className}`}
          style={{
            width,
            height,
            backgroundColor: 'var(--bg-tertiary)',
            marginBottom: count > 1 && i < count - 1 ? '0.5rem' : '0'
          }}
        />
      ))}
    </>
  );
};
