// Component tests for SearchBox, the debounced global-search dropdown.
//
// Collaborators are mocked:
// - searchApi.searchAll   -> the debounced query (also used to count requests)
// - MetaContext.useMeta   -> account-name lookup shown next to deals
// - react-router useNavigate -> navigation interception (routing itself stays
//   real so NavLink/Link behaviour is unchanged)
//
// Real timers are used on purpose: the component debounces with a 220ms
// setTimeout, and `waitFor` is the clearest way to observe both "fired" and
// "did not fire" outcomes.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Account,
  Contact,
  GlobalSearchResults,
  Interaction,
  Opportunity,
  Task,
} from '../types/domain';
import { SearchBox } from './SearchBox';

const h = vi.hoisted(() => ({
  searchAll: vi.fn(),
  useMeta: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../features/search/searchApi', () => ({ searchAll: h.searchAll }));
vi.mock('../features/meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('react-router', async (importActual) => ({
  ...(await importActual<typeof import('react-router')>()),
  useNavigate: () => h.navigate,
}));

const CONTACT: Contact = {
  id: 'c1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  jobTitle: 'CTO',
} as Contact;
const CONTACT_NO_TITLE: Contact = { id: 'c2', firstName: 'Ben', lastName: 'Smith' } as Contact;
const ACCOUNT: Account = { id: 'a1', name: 'Acme Corp' } as Account;
const OPPORTUNITY: Opportunity = { id: 'o1', name: 'Renewal', accountId: 'a1' } as Opportunity;
const TASK: Task = { id: 't1', title: 'Send proposal' } as Task;
const INTERACTION: Interaction = {
  id: 'i1',
  summary: 'Discussed the renewal timeline',
  contactId: 'c1',
} as Interaction;

/** Builds a full result payload; every group is empty unless overridden. */
function results(overrides: Partial<GlobalSearchResults> = {}): GlobalSearchResults {
  return {
    contacts: [],
    accounts: [],
    opportunities: [],
    tasks: [],
    interactions: [],
    counts: { contacts: 0, accounts: 0, opportunities: 0, tasks: 0, interactions: 0 },
    ...overrides,
  };
}

function renderSearchBox() {
  h.useMeta.mockReturnValue({
    userName: () => 'Unknown',
    accountName: (id?: string) => (id === 'a1' ? 'Acme Corp' : 'Unknown'),
  });
  return render(
    <MemoryRouter>
      <SearchBox />
    </MemoryRouter>,
  );
}

function searchInput() {
  return screen.getByLabelText('Global search') as HTMLInputElement;
}

afterEach(cleanup);

describe('SearchBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.searchAll.mockResolvedValue(results());
  });

  describe('query gating and debounce', () => {
    it('renders an accessible search input', () => {
      renderSearchBox();

      expect(searchInput()).toHaveAttribute('placeholder', 'Search customers, deals, tasks…');
    });

    it('does not query the API for a single-character term', async () => {
      const user = userEvent.setup();
      renderSearchBox();

      await user.type(searchInput(), 'a');
      await new Promise((resolve) => setTimeout(resolve, 320));

      expect(h.searchAll).not.toHaveBeenCalled();
      expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
    });

    it('does not query the API for a whitespace-only term', async () => {
      const user = userEvent.setup();
      renderSearchBox();

      await user.type(searchInput(), '   ');
      await new Promise((resolve) => setTimeout(resolve, 320));

      expect(h.searchAll).not.toHaveBeenCalled();
    });

    it('requests the final term once typing settles', async () => {
      const user = userEvent.setup();
      renderSearchBox();

      await user.type(searchInput(), 'ada');

      await waitFor(() => expect(h.searchAll).toHaveBeenCalled());
      // `useDeferredValue` may commit an intermediate term under load; the last
      // request must always be for the completed term.
      expect(h.searchAll).toHaveBeenLastCalledWith('ada');
    });

    it('trims the term before searching', async () => {
      const user = userEvent.setup();
      renderSearchBox();

      await user.type(searchInput(), '  ada  ');

      await waitFor(() => expect(h.searchAll).toHaveBeenCalledWith('ada'));
    });
  });

  describe('dropdown states', () => {
    it('stays closed while the query is shorter than two characters', async () => {
      const user = userEvent.setup();
      renderSearchBox();

      await user.type(searchInput(), 'a');

      expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
    });

    it('shows a searching placeholder while the request is pending', async () => {
      const user = userEvent.setup();
      h.searchAll.mockReturnValue(new Promise(() => undefined));
      renderSearchBox();

      await user.type(searchInput(), 'ada');

      expect(await screen.findByText('Searching…')).toBeInTheDocument();
    });

    it('stays in the searching state when the request rejects', async () => {
      const user = userEvent.setup();
      h.searchAll.mockRejectedValue(new Error('Search is unavailable'));
      renderSearchBox();

      await user.type(searchInput(), 'ada');

      // Wait for the debounced request to fire, then let the rejection settle.
      await waitFor(() => expect(h.searchAll).toHaveBeenCalledWith('ada'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(screen.getByText('Searching…')).toBeInTheDocument();
      expect(screen.queryByText(/No results for/)).not.toBeInTheDocument();
    });

    it('shows an empty-state message when every group is empty', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results());
      renderSearchBox();

      await user.type(searchInput(), 'zzz');

      expect(await screen.findByText(/No results for/)).toBeInTheDocument();
      expect(screen.queryByText('View all results')).not.toBeInTheDocument();
    });
  });

  describe('results rendering', () => {
    it('renders a row per group with the resolved account name', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(
        results({
          contacts: [CONTACT],
          accounts: [ACCOUNT],
          opportunities: [OPPORTUNITY],
          tasks: [TASK],
          interactions: [INTERACTION],
        }),
      );
      renderSearchBox();

      await user.type(searchInput(), 'ada');

      expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Ada Lovelace/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Renewal/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Send proposal/ })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Discussed the renewal timeline/ }),
      ).toBeInTheDocument();
      expect(screen.getByText('Contacts')).toBeInTheDocument();
      expect(screen.getByText('Deals')).toBeInTheDocument();
      expect(screen.getByText('Tasks')).toBeInTheDocument();
      expect(screen.getByText('Interactions')).toBeInTheDocument();
    });

    it('falls back to "Contact" when a contact has no job title', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ contacts: [CONTACT_NO_TITLE] }));
      renderSearchBox();

      await user.type(searchInput(), 'ben');

      expect(await screen.findByRole('button', { name: /Ben Smith/ })).toBeInTheDocument();
      expect(screen.getByText('· Contact')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to the contact and resets the box', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ contacts: [CONTACT] }));
      renderSearchBox();

      await user.type(searchInput(), 'ada');
      await user.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));

      expect(h.navigate).toHaveBeenCalledWith('/contacts/c1');
      expect(searchInput()).toHaveValue('');
      expect(screen.queryByRole('button', { name: /Ada Lovelace/ })).not.toBeInTheDocument();
    });

    it('navigates to the account detail route', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ accounts: [ACCOUNT] }));
      renderSearchBox();

      await user.type(searchInput(), 'acme');
      await user.click(await screen.findByRole('button', { name: /Acme Corp/ }));

      expect(h.navigate).toHaveBeenCalledWith('/accounts/a1');
    });

    it('navigates to the opportunity detail route', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ opportunities: [OPPORTUNITY] }));
      renderSearchBox();

      await user.type(searchInput(), 'ren');
      await user.click(await screen.findByRole('button', { name: /Renewal/ }));

      expect(h.navigate).toHaveBeenCalledWith('/opportunities/o1');
    });

    it('sends tasks to the tasks page', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ tasks: [TASK] }));
      renderSearchBox();

      await user.type(searchInput(), 'pro');
      await user.click(await screen.findByRole('button', { name: /Send proposal/ }));

      expect(h.navigate).toHaveBeenCalledWith('/tasks');
    });

    it('navigates to the contact behind an interaction', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ interactions: [INTERACTION] }));
      renderSearchBox();

      await user.type(searchInput(), 'disc');
      await user.click(await screen.findByRole('button', { name: /Discussed the renewal/ }));

      expect(h.navigate).toHaveBeenCalledWith('/contacts/c1');
    });

    it('navigates to the full search page with an encoded query', async () => {
      const user = userEvent.setup();
      h.searchAll.mockResolvedValue(results({ accounts: [ACCOUNT] }));
      renderSearchBox();

      await user.type(searchInput(), 'acme & co');
      await user.click(await screen.findByText(/View all results/));

      expect(h.navigate).toHaveBeenCalledWith('/search?q=acme%20%26%20co');
    });
  });

  it('closes the dropdown when a click lands outside of it', async () => {
    const user = userEvent.setup();
    h.searchAll.mockResolvedValue(results({ accounts: [ACCOUNT] }));
    renderSearchBox();

    await user.type(searchInput(), 'acme');
    expect(await screen.findByRole('button', { name: /Acme Corp/ })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('button', { name: /Acme Corp/ })).not.toBeInTheDocument();
  });
});
