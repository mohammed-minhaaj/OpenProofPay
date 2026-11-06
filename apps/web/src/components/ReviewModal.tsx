import React from 'react';
import { EvidenceInspectorModal } from './EvidenceInspectorModal.js';

export interface ReviewModalProps {
  task: any;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * ReviewModal: Unified One-Place Review Hub for Employers.
 * Displays the PR metadata, changed files, code diff, acceptance criteria validation,
 * AI security findings, and test execution results alongside the Human Review Decision Gate.
 */
export const ReviewModal: React.FC<ReviewModalProps> = ({
  task,
  onClose,
  onSuccess
}) => {
  return (
    <EvidenceInspectorModal
      task={task}
      onClose={onClose}
      onSuccess={onSuccess}
      isReviewMode={true}
    />
  );
};
