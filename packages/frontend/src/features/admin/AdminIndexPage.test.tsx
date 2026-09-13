// Component tests for AdminIndexPage (the admin overview dashboard).
//
// Collaborators are mocked so the tests focus on page behavior:
// - adminApi.listTrash            -> recoverable-records stat + loading dash
// - importWizard/importApi.listImportTemplates -> saved-mappings stat
// - MetaContext.useMeta           -> team/stage stat sources
// The real useQuery hook drives those two fetches exactly like in the app.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Contact, Stage, TrashPayload, User } from '../../types/domain';
import AdminIndexPage from './AdminIndexPage';

const h = vi.hoisted(() => ({
  listTrash: vi.fn(),
  listImportTemplates: vi.fn(),
  useMeta: vi.fn(),
}));

vi.mock('./adminApi', () => ({ listTrash: h.listTrash }));
vi.mock('./importWizard/importApi', () => ({ listImportTemplates: h.listImportTemplates }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Grace Hopper', email: 'grace@example.com', role: 'manager' },
  { id: 'u3', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const STAGES: Stage[] = [
  { id: 's1', name: 'Discovery', order: 1, winProbability: 20, classification: 'open' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 50, classification: 'open' },
  { id: 's3', name: 'Closed won', order: 3, winProbability: 100, classification: 'won' },
  { id: 's4', name: 'Closed lost', order: 4, winProbability: 0, classification: 'lost' },
];

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    status: 'active',
    accountLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme Corp',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function emptyTrash(): TrashPayload {
  return { contacts: [], accounts: [], opportunities: [], tasks: [], interactions: [] };
}

/** Returns the value <p> inside the stat card whose label is `label`. */
function statCard(label: string): HTMLElement {
  // The label text also appears in the AdminNav tabs and the tool cards, so
  // pin the match to the <p> stat label element (uppercase eyebrow style).
  const labelEl = screen.getAllByText(label).find((el) => el.tagName === 'P') as HTMLElement;
  const card = labelEl.parentElement as HTMLElement;
  return card.querySelector('p:nth-of-type(2)') as HTMLElement;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminIndexPage />
    </MemoryRouter>,
  );
}

describe('AdminIndexPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ users: USERS, stages: STAGES });
    h.listTrash.mockResolvedValue(emptyTrash());
    h.listImportTemplates.mockResolvedValue([]);
  });

  it('shows a loading dash for recoverable records while trash is pending', async () => {
    let resolveTrash!: (value: TrashPayload) => void;
    h.listTrash.mockImplementationOnce(
      () => new Promise<TrashPayload>((resolve) => (resolveTrash = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(statCard('Recoverable records')).toHaveTextContent('—');
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();

    resolveTrash(emptyTrash());
    await waitFor(() => expect(statCard('Recoverable records')).toHaveTextContent('0'));
  });

  it('renders stats from meta and trash once the queries settle', async () => {
    h.listTrash.mockResolvedValue({
      ...emptyTrash(),
      contacts: [makeContact()],
      accounts: [makeAccount(), makeAccount({ id: 'a2', name: 'Globex' })],
    });
    h.listImportTemplates.mockResolvedValue([
      {
        id: 't1',
        entity: 'contact' as const,
        name: 'Newsletter',
        mapping: { email: 'email' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]);

    renderPage();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    // Wait for the trash query first so the recoverable stat leaves its loading dash.
    await waitFor(() => expect(statCard('Recoverable records')).toHaveTextContent('3'));
    expect(statCard('Team members')).toHaveTextContent('3');
    expect(statCard('Pipeline stages')).toHaveTextContent('4');
    expect(statCard('Saved import mappings')).toHaveTextContent('1');
    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument();
    expect(h.listTrash).toHaveBeenCalledTimes(1);
    expect(h.listImportTemplates).toHaveBeenCalledTimes(1);
  });

  it('links every admin tool to its section route', async () => {
    renderPage();
    await screen.findByText('Admin');

    const toolHref = (title: string) =>
      (screen.getByRole('heading', { name: title }).closest('a') as HTMLAnchorElement).getAttribute(
        'href',
      );

    expect(toolHref('Users & roles')).toBe('/admin/users');
    expect(toolHref('Pipeline stages')).toBe('/admin/stages');
    expect(toolHref('CSV import')).toBe('/admin/import');
    expect(toolHref('Recovery')).toBe('/admin/recover');
  });

  it('falls back to zero counts when the trash query fails', async () => {
    h.listTrash.mockRejectedValue(new Error('Server down'));

    renderPage();

    await waitFor(() => expect(statCard('Recoverable records')).toHaveTextContent('0'));
    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument();
  });

  it('falls back to zero saved mappings when template metadata is unavailable', async () => {
    h.listImportTemplates.mockRejectedValue(new Error('Boom'));

    renderPage();

    await waitFor(() => expect(statCard('Saved import mappings')).toHaveTextContent('0'));
    await waitFor(() => expect(statCard('Recoverable records')).toHaveTextContent('0'));
  });
});
