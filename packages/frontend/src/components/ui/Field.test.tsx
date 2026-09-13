// Component tests for the form primitives (Field, Input, Textarea, Select).
//
// The shared logic lives in the FieldA11y context: a control nested in a Field
// picks up aria-describedby (hint/error) and aria-required, while caller-provided
// values always win. Those rules are the focus of these tests, alongside the
// invalid styling and className merging.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, Input, Select, Textarea } from './Field';

afterEach(cleanup);

describe('Field', () => {
  it('renders a label bound to the control id', () => {
    render(
      <Field label="Email" htmlFor="email">
        <Input id="email" />
      </Field>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('marks the label as required and forwards aria-required to the control', () => {
    render(
      <Field label="Email" htmlFor="email" required>
        <Input id="email" />
      </Field>,
    );

    // The required marker is part of the label text, hence the regex match.
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not mark the control required by default', () => {
    render(
      <Field label="Email" htmlFor="email">
        <Input id="email" />
      </Field>,
    );

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-required');
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('links the hint paragraph through aria-describedby', () => {
    render(
      <Field label="Email" htmlFor="email" hint="We never share it">
        <Input id="email" />
      </Field>,
    );

    const hint = screen.getByText('We never share it');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', hint.id);
  });

  it('renders no hint paragraph when no hint is given', () => {
    render(
      <Field label="Email" htmlFor="email">
        <Input id="email" />
      </Field>,
    );

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-describedby');
  });

  it('links the error paragraph and hides the hint while an error is shown', () => {
    render(
      <Field label="Email" htmlFor="email" hint="We never share it" error="Email is required">
        <Input id="email" />
      </Field>,
    );

    const error = screen.getByText('Email is required');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', error.id);
    expect(screen.queryByText('We never share it')).not.toBeInTheDocument();
  });

  it('lets a caller-provided aria-describedby win over the field context', () => {
    render(
      <Field label="Email" htmlFor="email" hint="We never share it">
        <Input id="email" aria-describedby="external-note" />
      </Field>,
    );

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'external-note');
  });

  it('lets a caller-provided aria-required win over the field context', () => {
    render(
      <Field label="Email" htmlFor="email" required>
        <Input id="email" aria-required={false} />
      </Field>,
    );

    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-required', 'false');
  });

  it('renders arbitrary children inside the field', () => {
    render(
      <Field label="Owner">
        <span>custom control</span>
      </Field>,
    );

    expect(screen.getByText('custom control')).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('renders a text input with the shared control styling', () => {
    render(<Input aria-label="Email" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveClass('w-full', 'rounded-md', 'border-ink/15');
  });

  it('is not marked invalid by default', () => {
    render(<Input aria-label="Email" />);

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('marks itself invalid and applies the danger styling', () => {
    render(<Input aria-label="Email" invalid />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('border-danger/60');
    expect(input).not.toHaveClass('border-ink/15');
  });

  it('merges a caller className', () => {
    render(<Input aria-label="Email" className="max-w-sm" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveClass('max-w-sm');
    expect(input).toHaveClass('w-full');
  });

  it('works standalone, outside a Field', () => {
    render(<Input aria-label="Email" />);

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-describedby');
  });
});

describe('Textarea', () => {
  it('renders a textarea with the shared control styling', () => {
    render(<Textarea aria-label="Notes" />);

    const textarea = screen.getByLabelText('Notes');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveClass('min-h-24', 'resize-y', 'border-ink/15');
  });

  it('applies the danger styling when invalid', () => {
    render(<Textarea aria-label="Notes" invalid />);

    const textarea = screen.getByLabelText('Notes');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveClass('border-danger/60');
  });

  it('picks up the field context when nested in a Field', () => {
    render(
      <Field label="Notes" htmlFor="notes" hint="Internal only" required>
        <Textarea id="notes" />
      </Field>,
    );

    const textarea = screen.getByLabelText(/Notes/);
    expect(textarea).toHaveAttribute('aria-describedby', screen.getByText('Internal only').id);
    expect(textarea).toHaveAttribute('aria-required', 'true');
  });
});

describe('Select', () => {
  it('renders a select with its options', () => {
    render(
      <Select aria-label="Role">
        <option value="admin">Administrator</option>
        <option value="rep">Sales Rep</option>
      </Select>,
    );

    const select = screen.getByLabelText('Role');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Administrator' })).toBeInTheDocument();
    expect(select).toHaveClass('cursor-pointer');
  });

  it('applies the danger styling when invalid', () => {
    render(
      <Select aria-label="Role" invalid>
        <option value="rep">Sales Rep</option>
      </Select>,
    );

    const select = screen.getByLabelText('Role');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveClass('border-danger/60');
  });

  it('picks up the field context when nested in a Field', () => {
    render(
      <Field label="Role" htmlFor="role" error="Pick a role">
        <Select id="role">
          <option value="rep">Sales Rep</option>
        </Select>
      </Field>,
    );

    const select = screen.getByLabelText('Role');
    expect(select).toHaveAttribute('aria-describedby', screen.getByText('Pick a role').id);
  });
});
