// Component tests for OpportunityFormModal.
//
// External collaborators are mocked so the tests focus on form behavior:
// - opportunitiesApi.create/update -> save payload + outcome
// - contactsApi.listContacts       -> contact options
// - MetaContext.useMeta            -> accounts / stages / owners
// - SessionContext.useSession      -> the current user (default owner)
// - toast.useToast                 -> success feedback
//
// The real Modal is used (it portals into document.body, which jsdom supports).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, Opportunity, PaginatedResult, Stage, User } from '../../types/domain';
import type { AccountMeta } from '../meta/metaApi';
import { OpportunityFormModal } from './OpportunityFormModal';

const h = vi.hoisted(() => ({
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  listContacts: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./opportunitiesApi', () => ({
  createOpportunity: h.createOpportunity,
  updateOpportunity: h.updateOpportunity,
}));
vi.mock('../contacts/contactsApi', () => ({ listContacts: h.listContacts }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../meta/useEnsureStages', () => ({ useEnsureStages: vi.fn() }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

// The first entry is a closed stage: the form must pick the first *open* one.
const STAGES: Stage[] = [
  { id: 's0', name: 'Won', order: 9, winProbability: 100, classification: 'won' },
  { id: 's1', name: 'Discovery', order: 1, winProbability: 10, classification: 'open' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 40, classification: 'open' },
];

const ACCOUNTS: AccountMeta[] = [
  { id: 'acc1', name: 'Acme Corp', ownerId: 'u1' },
  { id: 'acc2', name: 'Initech', ownerId: 'u2' },
];

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const CURRENT_USER = USERS[0];

const CONTACTS: Contact[] = [
  {
    id: 'c1',
    firstName: 'Grace',
    lastName: 'Hopper',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
  },
];

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Platform renewal',
    contactId: 'c1',
    accountId: 'acc1',
    valueMinor: 250000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    stageId: 's1',
    probability: 25,
    probabilityManual: true,
    ownerId: 'u2',
    description: 'Renewal with an upsell',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function contactPage(items: Contact[]): PaginatedResult<Contact> {
  return { items, total: items.length, page: 1, pageSize: 25 };
}

const onClose = vi.fn();
const onSaved = vi.fn();

function renderModal(options: { open?: boolean; opportunity?: Opportunity | null } = {}) {
  const { open = true, opportunity = null } = options;
  return render(
    <OpportunityFormModal
      open={open}
      onClose={onClose}
      onSaved={onSaved}
      opportunity={opportunity}
    />,
  );
}

const valueLabel = () => screen.getByLabelText('Value (USD)');
const probabilityLabel = () => screen.getByLabelText('Probability (%)');
// "Deal name" and "Account" are required, so their labels carry an extra "*".
const nameLabel = () => screen.getByLabelText(/^Deal name/);
const accountLabel = () => screen.getByLabelText(/^Account/);

// Vitest globals are disabled, so RTL's automatic cleanup does not run.
afterEach(() => cleanup());

describe('OpportunityFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.listContacts.mockResolvedValue(contactPage(CONTACTS));
    h.createOpportunity.mockResolvedValue(makeOpp());
    h.updateOpportunity.mockResolvedValue(makeOpp({ name: 'Renamed deal' }));
    h.useMeta.mockReturnValue({ accounts: ACCOUNTS, stages: STAGES, users: USERS });
    h.useSession.mockReturnValue({ user: CURRENT_USER });
  });

  describe('visibility', () => {
    it('renders nothing while closed', () => {
      renderModal({ open: false });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(h.listContacts).not.toHaveBeenCalled();
    });
  });

  describe('create defaults', () => {
    it('defaults to the first open stage, its probability, and the current user', async () => {
      renderModal();

      expect(await screen.findByRole('dialog')).toHaveAccessibleName('New deal');
      expect(screen.getByLabelText('Stage')).toHaveValue('s1');
      expect(probabilityLabel()).toHaveValue(10);
      expect(screen.getByLabelText('Owner')).toHaveValue('u1');
      expect(nameLabel()).toHaveValue('');
      expect(accountLabel()).toHaveValue('');
      expect(valueLabel()).toHaveValue(0);
      expect(screen.getByLabelText('Expected close date')).toHaveValue('');
      expect(h.listContacts).toHaveBeenCalledWith({});
    });

    it('lists accounts, contacts, stages, and owners as options', async () => {
      renderModal();

      expect(await screen.findByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Initech' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Discovery' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Proposal' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toBeInTheDocument();
    });

    it('keeps the form usable when contacts cannot be loaded', async () => {
      h.listContacts.mockRejectedValue(new Error('offline'));

      renderModal();

      expect(await screen.findByRole('option', { name: 'None' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Grace Hopper' })).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('blocks submission and focuses the first invalid field', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      expect(screen.getByText('Name is required.')).toBeInTheDocument();
      expect(screen.getByText('Account is required.')).toBeInTheDocument();
      expect(nameLabel()).toHaveFocus();
      expect(h.createOpportunity).not.toHaveBeenCalled();
    });

    it('focuses the account once the name is filled in', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'New logo');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
      expect(screen.getByText('Account is required.')).toBeInTheDocument();
      expect(accountLabel()).toHaveFocus();
    });

    it('clears a field error as soon as the user edits it', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: 'Create deal' }));
      expect(screen.getByText('Name is required.')).toBeInTheDocument();

      await user.type(nameLabel(), 'x');

      expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
    });
  });

  describe('creating', () => {
    it('posts the trimmed payload with the currency and minor-unit value', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), '  New logo  ');
      await user.selectOptions(accountLabel(), 'acc2');
      await user.selectOptions(screen.getByLabelText('Contact'), 'c1');
      await user.clear(valueLabel());
      await user.type(valueLabel(), '1234.56');
      // Date inputs reject partially typed values, so set the value directly.
      fireEvent.change(screen.getByLabelText('Expected close date'), {
        target: { value: '2026-12-24' },
      });
      await user.selectOptions(screen.getByLabelText('Owner'), 'u2');
      await user.type(screen.getByLabelText('Description'), '  Land and expand  ');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() =>
        expect(h.createOpportunity).toHaveBeenCalledWith({
          name: 'New logo',
          accountId: 'acc2',
          contactId: 'c1',
          valueMinor: 123456,
          currency: 'USD',
          expectedCloseDate: '2026-12-24',
          stageId: 's1',
          probability: 10,
          probabilityManual: false,
          ownerId: 'u2',
          description: 'Land and expand',
        }),
      );
      expect(h.show).toHaveBeenCalledWith('Deal created', 'success');
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('omits the contact when none is selected', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'New logo');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() => expect(h.createOpportunity).toHaveBeenCalled());
      // The key is present but empty so the server clears any previous contact.
      expect(h.createOpportunity.mock.calls[0][0].contactId).toBeUndefined();
    });

    it('treats a blank value as zero', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'Free pilot');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.clear(valueLabel());
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() =>
        expect(h.createOpportunity).toHaveBeenCalledWith(
          expect.objectContaining({ valueMinor: 0 }),
        ),
      );
    });

    it('rounds the entered amount to the nearest cent', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'Rounding');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.clear(valueLabel());
      await user.type(valueLabel(), '99.99');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() =>
        expect(h.createOpportunity).toHaveBeenCalledWith(
          expect.objectContaining({ valueMinor: 9999 }),
        ),
      );
    });

    it('disables the submit button and shows a saving label while in flight', async () => {
      const user = userEvent.setup();
      let resolveCreate!: (value: Opportunity) => void;
      h.createOpportunity.mockImplementationOnce(
        () => new Promise<Opportunity>((resolve) => (resolveCreate = resolve)),
      );
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'New logo');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

      resolveCreate(makeOpp());
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('surfaces the server message and keeps the modal open', async () => {
      const user = userEvent.setup();
      h.createOpportunity.mockRejectedValueOnce(new Error('Account has been deleted'));
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'New logo');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      expect(await screen.findByText('Account has been deleted')).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error failures', async () => {
      const user = userEvent.setup();
      h.createOpportunity.mockRejectedValueOnce('nope');
      renderModal();
      await screen.findByRole('dialog');

      await user.type(nameLabel(), 'New logo');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      expect(await screen.findByText('Save failed')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('prefills every field from the opportunity', async () => {
      renderModal({ opportunity: makeOpp() });

      expect(await screen.findByRole('dialog')).toHaveAccessibleName('Edit deal');
      expect(nameLabel()).toHaveValue('Platform renewal');
      expect(accountLabel()).toHaveValue('acc1');
      expect(screen.getByLabelText('Contact')).toHaveValue('c1');
      // Stored minor units are shown as dollars.
      expect(valueLabel()).toHaveValue(2500);
      expect(screen.getByLabelText('Expected close date')).toHaveValue('2026-06-30');
      expect(screen.getByLabelText('Stage')).toHaveValue('s1');
      expect(probabilityLabel()).toHaveValue(25);
      expect(screen.getByLabelText('Owner')).toHaveValue('u2');
      expect(screen.getByLabelText('Description')).toHaveValue('Renewal with an upsell');
      expect(screen.getByText('Manually set')).toBeInTheDocument();
    });

    it('patches the opportunity with the edited fields', async () => {
      const user = userEvent.setup();
      renderModal({ opportunity: makeOpp() });
      await screen.findByRole('dialog');

      await user.clear(nameLabel());
      await user.type(nameLabel(), 'Renewal 2027');
      await user.clear(valueLabel());
      await user.type(valueLabel(), '3000');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateOpportunity).toHaveBeenCalledWith(
          'o1',
          expect.objectContaining({
            name: 'Renewal 2027',
            valueMinor: 300000,
            probability: 25,
            probabilityManual: true,
            currency: 'USD',
          }),
        ),
      );
      expect(h.createOpportunity).not.toHaveBeenCalled();
      expect(h.show).toHaveBeenCalledWith('Deal updated', 'success');
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('resets the fields for a new deal after being opened for an edit', async () => {
      const { rerender } = renderModal({ opportunity: makeOpp() });
      await screen.findByRole('dialog');

      rerender(
        <OpportunityFormModal open onClose={onClose} onSaved={onSaved} opportunity={null} />,
      );

      expect(nameLabel()).toHaveValue('');
      expect(valueLabel()).toHaveValue(0);
      expect(probabilityLabel()).toHaveValue(10);
      expect(screen.getByLabelText('Owner')).toHaveValue('u1');
      expect(screen.getByLabelText('Stage')).toHaveValue('s1');
      expect(screen.getByRole('button', { name: 'Create deal' })).toBeInTheDocument();
    });
  });

  describe('probability handling', () => {
    it('adopts the stage probability when the stage changes', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      expect(screen.getByText('Auto from stage')).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Stage'), 's2');

      expect(probabilityLabel()).toHaveValue(40);
      expect(screen.getByText('Auto from stage')).toBeInTheDocument();
    });

    it('marks the probability manual once the user edits it', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.clear(probabilityLabel());
      await user.type(probabilityLabel(), '65');

      expect(probabilityLabel()).toHaveValue(65);
      expect(screen.getByText('Manually set')).toBeInTheDocument();

      await user.type(nameLabel(), 'Negotiated deal');
      await user.selectOptions(accountLabel(), 'acc1');
      await user.click(screen.getByRole('button', { name: 'Create deal' }));

      await waitFor(() =>
        expect(h.createOpportunity).toHaveBeenCalledWith(
          expect.objectContaining({ probability: 65, probabilityManual: true }),
        ),
      );
    });

    it('reverts a manually set probability when the stage changes', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.clear(probabilityLabel());
      await user.type(probabilityLabel(), '65');
      expect(screen.getByText('Manually set')).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Stage'), 's2');

      expect(probabilityLabel()).toHaveValue(40);
      expect(screen.getByText('Auto from stage')).toBeInTheDocument();
    });
  });

  describe('dismissal', () => {
    it('closes from Cancel and Escape without saving', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(2);
      expect(h.createOpportunity).not.toHaveBeenCalled();
    });
  });
});
