// Component tests for MapColumnsStep (header -> field mapping, templates).
//
// The component is fully prop-driven except for the template side panel and
// the Auto-map button, so its API and toast collaborators are mocked:
// - ./importApi.listImportTemplates/saveImportTemplate/deleteImportTemplate
// - toast.useToast
// The field catalog (fields.ts) stays real so mapping options reflect source.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportEntity, ImportMappingTemplate } from '../../../types/domain';
import { MapColumnsStep } from './MapColumnsStep';

const h = vi.hoisted(() => ({
  listImportTemplates: vi.fn(),
  saveImportTemplate: vi.fn(),
  deleteImportTemplate: vi.fn(),
  onChange: vi.fn(),
  onBack: vi.fn(),
  onNext: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./importApi', () => ({
  listImportTemplates: h.listImportTemplates,
  saveImportTemplate: h.saveImportTemplate,
  deleteImportTemplate: h.deleteImportTemplate,
}));
vi.mock('../../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

const TEMPLATE: ImportMappingTemplate = {
  id: 't1',
  entity: 'contact',
  name: 'Newsletter',
  mapping: { email: 'email', phone1: 'phone' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

interface RenderProps {
  entity?: ImportEntity;
  headers?: string[];
  mapping?: Record<string, string>;
}

function renderStep(overrides: RenderProps = {}) {
  const { entity = 'contact', headers = ['First Name', 'Email'], mapping = {} } = overrides;
  return render(
    <MapColumnsStep
      entity={entity}
      headers={headers}
      mapping={mapping}
      onChange={h.onChange}
      onBack={h.onBack}
      onNext={h.onNext}
    />,
  );
}

const columnSelect = (header: string) => screen.getByLabelText(`Map column "${header}" to a field`);

describe('MapColumnsStep', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    h.listImportTemplates.mockResolvedValue([TEMPLATE]);
    h.saveImportTemplate.mockImplementation(async (input: { name: string }) => ({
      id: 't2',
      entity: 'contact' as const,
      name: input.name,
      mapping: { 'First Name': 'firstName', Email: 'email' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    }));
    h.deleteImportTemplate.mockResolvedValue(undefined);
  });

  it('renders one mapping select per header with the mapped value selected', () => {
    renderStep({ mapping: { Email: 'email' } });

    // Header labels are also option labels once a field shares the name, so
    // scope the lookup to the header cell (it carries the header as its title).
    expect(screen.getByTitle('First Name')).toBeInTheDocument();
    expect(screen.getByTitle('Email')).toBeInTheDocument();
    expect(columnSelect('Email')).toHaveValue('email');
    expect(columnSelect('First Name')).toHaveValue('');
    // Every option offers "ignore" plus the entity field catalog.
    const options = within(columnSelect('Email'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options[0]).toBe('— Ignore this column —');
    // Required fields carry a marker; email is optional.
    expect(options).toContain('First name *');
    expect(options).toContain('Email');
  });

  it('requests templates for the current entity on mount', async () => {
    renderStep();

    expect(await screen.findByText('Newsletter')).toBeInTheDocument();
    expect(h.listImportTemplates).toHaveBeenCalledWith('contact');
  });

  it('shows the empty copy when no templates exist or the request fails', async () => {
    h.listImportTemplates.mockResolvedValue([]);
    renderStep();

    expect(
      await screen.findByText('No templates yet. Save this mapping to reuse it next time.'),
    ).toBeInTheDocument();

    cleanup();
    h.listImportTemplates.mockRejectedValueOnce(new Error('Boom'));
    renderStep();

    expect(
      await screen.findByText('No templates yet. Save this mapping to reuse it next time.'),
    ).toBeInTheDocument();
  });

  it('applies a saved template when its name is clicked', async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByText('Newsletter');

    await user.click(screen.getByRole('button', { name: 'Newsletter' }));

    expect(h.onChange).toHaveBeenCalledWith(TEMPLATE.mapping);
  });

  it('deletes a template from the list after confirmation-less delete click', async () => {
    const user = userEvent.setup();
    renderStep();
    await screen.findByText('Newsletter');

    await user.click(screen.getByRole('button', { name: 'Delete template Newsletter' }));

    await waitFor(() => expect(h.deleteImportTemplate).toHaveBeenCalledWith('t1'));
    expect(h.show).toHaveBeenCalledWith('Template deleted', 'success');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Newsletter' })).not.toBeInTheDocument(),
    );
  });

  it('toasts the server message when deleting a template fails', async () => {
    const user = userEvent.setup();
    h.deleteImportTemplate.mockRejectedValueOnce(new Error('Delete failed'));
    renderStep();
    await screen.findByText('Newsletter');

    await user.click(screen.getByRole('button', { name: 'Delete template Newsletter' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Delete failed', 'error'));
  });

  it('updates the mapping through a header select', async () => {
    const user = userEvent.setup();
    renderStep({ mapping: { Email: 'email' } });

    await user.selectOptions(columnSelect('First Name'), 'firstName');

    expect(h.onChange).toHaveBeenCalledWith({ Email: 'email', 'First Name': 'firstName' });
  });

  it('applies the best-guess mapping from Auto-map and confirms with an info toast', async () => {
    const user = userEvent.setup();
    renderStep({ headers: ['First Name', 'email', 'phone1'] });

    await user.click(screen.getByRole('button', { name: 'Auto-map' }));

    expect(h.onChange).toHaveBeenCalledWith({
      'First Name': 'firstName',
      email: 'email',
      phone1: 'phone',
    });
    expect(h.show).toHaveBeenCalledWith('Best-guess mapping applied — adjust as needed', 'info');
  });

  it('maps an account "Name"/"Address" header set to account fields', async () => {
    const user = userEvent.setup();
    h.listImportTemplates.mockResolvedValue([]);
    renderStep({ entity: 'account', headers: ['Name', 'Address'] });

    await user.click(screen.getByRole('button', { name: 'Auto-map' }));

    expect(h.onChange).toHaveBeenCalledWith({
      Name: 'name',
      Address: 'billingAddress',
    });
    expect(h.listImportTemplates).toHaveBeenCalledWith('account');
  });

  it('warns and disables Review rows until at least one column is mapped', async () => {
    const user = userEvent.setup();
    renderStep();

    expect(screen.getByText('Map at least one column before continuing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review rows' })).toBeDisabled();

    cleanup();
    renderStep({ mapping: { Email: 'email' } });
    expect(screen.getByRole('button', { name: 'Review rows' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Review rows' }));
    expect(h.onNext).toHaveBeenCalled();
  });

  it('lists still-unmapped required fields', () => {
    renderStep({ mapping: { Email: 'email' } });

    expect(
      screen.getByText(/Required fields not mapped yet: First name, Last name/),
    ).toBeInTheDocument();
  });

  it('goes back through the Back button', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(h.onBack).toHaveBeenCalled();
  });

  it('saves the current mapping under a typed name', async () => {
    const user = userEvent.setup();
    const mapping = { 'First Name': 'firstName', Email: 'email' };
    renderStep({ mapping });

    await user.type(screen.getByLabelText('Template name'), 'My import');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(h.saveImportTemplate).toHaveBeenCalledWith({
        entity: 'contact',
        name: 'My import',
        mapping,
        ownerColumn: undefined,
      }),
    );
    expect(h.show).toHaveBeenCalledWith('Template "My import" saved', 'success');
    // The new template appears in the list and the name field is cleared.
    expect(await screen.findByRole('button', { name: 'My import' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Template name')).toHaveValue(''));
  });

  it('records the owner column header when the mapping has one', async () => {
    const user = userEvent.setup();
    h.listImportTemplates.mockResolvedValue([]);
    renderStep({
      headers: ['Owner email', 'Email'],
      mapping: { 'Owner email': 'ownerEmail', Email: 'email' },
    });

    await user.type(screen.getByLabelText('Template name'), 'Owners');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(h.saveImportTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ ownerColumn: 'Owner email' }),
      ),
    );
  });

  it('does not save when no template name is typed', async () => {
    const user = userEvent.setup();
    renderStep({ mapping: { Email: 'email' } });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(h.saveImportTemplate).not.toHaveBeenCalled();
  });

  it('toasts the server message when saving a template fails', async () => {
    const user = userEvent.setup();
    h.saveImportTemplate.mockRejectedValueOnce(new Error('Save failed'));
    renderStep({ mapping: { Email: 'email' } });

    await user.type(screen.getByLabelText('Template name'), 'My import');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Save failed', 'error'));
  });
});
