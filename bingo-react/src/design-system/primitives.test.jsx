import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, Card, Field, Modal, StatusBadge } from './primitives';

describe('Premium Festivo primitives', () => {
  it('exposes the primary action with the design-system classes', () => {
    render(<Button>Start game</Button>);

    expect(screen.getByRole('button', { name: 'Start game' })).toHaveClass(
      'pf-button',
      'pf-button--primary'
    );
  });

  it('composes cards, status badges and labelled fields', () => {
    render(
      <Card>
        <StatusBadge tone="success">Ready</StatusBadge>
        <Field label="Room code" hint="Six characters" />
      </Card>
    );

    expect(screen.getByText('Ready')).toHaveClass('pf-status', 'pf-status--success');
    expect(screen.getByLabelText('Room code')).toHaveClass('pf-field__control');
    expect(screen.getByText('Six characters')).toBeInTheDocument();
  });

  it('does not render a closed modal and exposes dialog semantics when open', () => {
    const { rerender } = render(<Modal open={false} title="Rules">Rules body</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<Modal title="Rules">Rules body</Modal>);
    expect(screen.getByRole('dialog', { name: 'Rules' })).toHaveTextContent('Rules body');
  });
});
