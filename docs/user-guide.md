# Custotal User Guide

**For business users of a self-hosted Custotal workspace.**

This guide explains, in plain language, how to use Custotal day to day — from
signing in and adding your first contact, through running a deal to a close, to
the reports you can take into a meeting. It assumes **no technical background**:
every instruction points to something you can see and click in the app.

If you run the server, deploy the stack, or manage backups, use
[Self-hosting](self-hosting.md) instead. This guide is for the people who sell.

## How to use this guide

- **New to Custotal?** Read [§1 What Custotal is](#1-what-custotal-is) through
  [§5 Getting started](#5-getting-started), then work through
  [§12 Common business workflows](#12-common-business-workflows).
- **Looking for a specific task?** Jump to the matching chapter in the
  [table of contents](#table-of-contents) or the
  [quick reference](#15-quick-reference).
- **An administrator?** [§11 Administrator tasks](#11-administrator-tasks)
  covers users, the pipeline, spreadsheet import, and recovery.

> **One thing to know up front.** Custotal is deliberately small. It tracks
> customers, conversations, deals, and tasks for one sales team in one
> workspace. It is not a marketing suite, a help desk, or a place to manage
> multiple separate companies. Keeping it narrow is what makes it easy to run.

## Table of contents

- [1. What Custotal is](#1-what-custotal-is)
- [2. Key concepts and vocabulary](#2-key-concepts-and-vocabulary)
- [3. Roles and permissions](#3-roles-and-permissions)
- [4. Where your data lives](#4-where-your-data-lives)
- [5. Getting started](#5-getting-started)
- [6. The Dashboard](#6-the-dashboard)
- [7. Contacts](#7-contacts)
- [8. Accounts](#8-accounts)
- [9. Interactions — logging what happened](#9-interactions--logging-what-happened)
- [10. The pipeline and deals, tasks, search, and reports](#10-the-pipeline-and-deals)
  - [10.1 Pipeline and deals](#101-pipeline-and-deals)
  - [10.2 Tasks](#102-tasks)
  - [10.3 Search](#103-search)
  - [10.4 Reports](#104-reports)
- [11. Administrator tasks](#11-administrator-tasks)
- [12. Common business workflows](#12-common-business-workflows)
- [13. Best practices](#13-best-practices)
- [14. Troubleshooting and FAQ](#14-troubleshooting-and-faq)
- [15. Quick reference](#15-quick-reference)

---

## 1. What Custotal is

Custotal is a **self-hosted CRM** — a customer relationship manager that your
organization runs on its own infrastructure. That means your customer data is
stored in your own database, and no outside company holds your customer list.

It covers the working surface of a small sales team:

| Area             | What it gives you                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Contacts**     | Every person you work with, with email, phone, title, status, and links to the accounts they belong to.                  |
| **Accounts**     | The organizations you sell to, with industry, website, billing address, owner, and their linked contacts and deals.      |
| **Interactions** | A shared timeline of emails, calls, meetings, and notes — so nobody has to ask "did anyone follow up?"                   |
| **Pipeline**     | A drag-and-drop board of deals through configurable stages, with automatic win probability and a recorded stage history. |
| **Tasks**        | Follow-ups with due dates, priorities, and an owner, plus overdue highlighting and completion history.                   |
| **Reports**      | Pipeline-by-stage and win/loss reporting with charts and CSV export.                                                     |
| **Search**       | One box that finds contacts, accounts, deals, tasks, and interaction notes at once.                                      |

### 1.1 Is Custotal a good fit?

Custotal is built for a **B2B sales team of roughly 3 to 15 people** that wants a
CRM it can stand up quickly and keep for years, without a per-seat subscription.

**What it does well**

- Keeps a single, reliable view of who your customers are and what has happened
  with them.
- Makes the next action visible on every deal, so opportunities stop going quiet.
- Gives managers a forecast they can trust without chasing status updates.
- Gives administrators full control of the team, the pipeline, and recovery of
  deleted records.

**What it does not do (by design)**

- No marketing automation, email campaigns, or service desk.
- No native mobile app — it is a web app that works in a phone browser.
- One pipeline configuration and one workspace; you cannot run several
  independent pipelines or tenants.
- No self-service sign-up. An administrator creates every account.

> **Evaluate honestly.** If your team needs campaign automation, quoting/CPQ, a
> customer support inbox, or a mobile app, Custotal is the wrong tool. If your
> team needs a fast, private, dependable place to run a sales pipeline, it is a
> strong fit.

---

## 2. Key concepts and vocabulary

The rest of this guide uses these terms. A few minutes here saves confusion
later.

| Term                   | Meaning                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Contact**            | A person — a buyer, a champion, an accountant. Contacts can be linked to one or more accounts.                                         |
| **Account**            | An organization you sell to. An account is the home for its contacts, deals, and activity.                                             |
| **Deal** (opportunity) | A potential sale, with a value, an expected close date, a stage, and a probability.                                                    |
| **Stage**              | One step in the pipeline (for example Lead → Qualified → Proposal → Negotiation → Won/Lost). Each stage has a default win probability. |
| **Classification**     | What kind of stage it is: **Open** (in progress), **Won**, or **Lost**. Every stage is exactly one of these.                           |
| **Probability**        | The chance a deal will close, shown as a percentage. It usually updates automatically when you move a deal between stages.             |
| **Interaction**        | One logged touchpoint — an email, call, meeting, note, or "other" — on a timeline.                                                     |
| **Task**               | A follow-up with a title, optional due date, priority, and assignee.                                                                   |
| **Owner**              | The user responsible for a record (an account, a deal, or a task).                                                                     |
| **Assignee**           | The user a task is assigned to.                                                                                                        |
| **Soft delete**        | Deleting a record hides it but keeps it recoverable by an administrator for 30 days.                                                   |
| **Trash / Recovery**   | The administrator area where soft-deleted records can be restored or permanently purged.                                               |

---

## 3. Roles and permissions

Every user has exactly one role. Your role decides what you can **do** and how
much you can **see**.

| Role shown in the app | Can create, edit, and delete? | What they can see                                                                    |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| **Administrator**     | Yes                           | Everything, plus the Admin area.                                                     |
| **Manager**           | Yes                           | Everything across the team.                                                          |
| **Sales Rep**         | Yes                           | The team's contacts and accounts; **only their own** deals, tasks, and interactions. |
| **Read-Only**         | No — viewing only             | Everything across the team, but no edit buttons anywhere.                            |

Two rules are worth memorizing:

- **Contacts and accounts are shared.** Every signed-in user sees the full list,
  regardless of role.
- **Deals, tasks, and interactions are "owner-scoped" for Sales Reps.** A Sales
  Rep sees only the deals they own, the tasks assigned to them, and the
  interactions they logged or are responsible for. Managers, administrators, and
  Read-Only users see all of them.

Only **Administrators** can open the Admin area (users, pipeline stages, CSV
import, and recovery). If you do not see an **Admin** section in the sidebar,
your role does not include it — ask an administrator if you need access.

> **Note:** Custotal always keeps at least one administrator. You cannot delete
> or demote the last remaining administrator, and you cannot delete your own
> account while signed in.

---

## 4. Where your data lives

Your workspace's records are stored in your organization's own PostgreSQL
database, behind the Custotal server your team runs. Practical consequences:

- **Your data is not shared across organizations.** There is one workspace per
  installation.
- **Deletion is a two-step safety net.** When you delete a contact, account,
  deal, task, or interaction, it moves to an administrator's **Recovery** page
  and stays there for **30 days** before it is purged automatically.
- **Activity is attributable.** Every record tracks who created it and when it
  was last modified, and the detail pages show this "record history".

---

## 5. Getting started

Custotal has no sign-up page. An **administrator creates your account** and you
receive either an email invitation or a temporary password.

### 5.1 Signing in

1. Open your workspace's web address in a browser.
2. Enter your **Email** and **Password**.
3. Click **Sign in**.

If the password field hides what you type, use the eye button
(**Show password** / **Hide password**) to check it.

**If you cannot reach the server**, the page shows _"Can't reach your server"_ and
a **Retry** button. Check your connection, then retry. If it persists, tell your
administrator — the Custotal server may be down.

**If your sign-in is refused**, the message is deliberately general: _"Invalid
email or password."_ Check both fields. After several rapid failures, sign-in
pauses briefly for security; wait a minute and try again.

Your session stays active while you work and ends after about **8 hours of
inactivity**.

### 5.2 Accepting an invitation

If your administrator invited you by email:

1. Open the invitation email and click the link.
2. The **Set up your account** page opens. Enter a **New password** and
   **Confirm password** (at least 8 characters, and they must match).
3. Click **Set password**.
4. You will see _"Your password is set."_ Click **Go to sign in**, then sign in
   with your email and new password.

Invitation links are one-time and expire, so complete setup when you get the
email. If the link no longer works, ask your administrator to resend the
invitation.

### 5.3 First sign-in with a temporary password

Sometimes email delivery is unavailable and your administrator gives you a
temporary password directly. On your first sign-in, Custotal sends you straight
to the **Choose your own password** screen and will not let you into the rest of
the app until you set a new one:

1. Enter the **Temporary password** your administrator gave you.
2. Enter a **New password** (at least 8 characters) and **Confirm new password**.
3. Click **Update password**.
4. You will be returned to sign-in. Sign in with your new password.

Temporary passwords expire after several days. If yours has expired, use
**Forgot password?** on the sign-in page.

### 5.4 Forgot your password

1. On the sign-in page, click **Forgot password?**
2. Enter your **Email** and click **Send reset link**.
3. For privacy, Custotal always says the same thing — _"Check your inbox"_ —
   whether or not an account exists, so nobody can use this page to discover who
   has an account.
4. Open the email and follow the link to **Choose a new password**.
5. Set and confirm your new password, then sign in.

Reset links expire and work only once. The link in the email expires within the
hour, so use it promptly.

### 5.5 Changing your own password later

1. Click your **name** in the top-right corner.
2. Choose **Change password**.
3. Enter your current password and your new password twice, then save.

Changing your password signs you out of all devices, including the current one —
sign in again with the new password.

### 5.6 Finding your way around

Custotal has a left **sidebar** for navigation and a top bar for search and your
account:

- **Sidebar (left):** **Dashboard**, **Contacts**, **Accounts**, **Pipeline**,
  **Tasks**, then a **Reports** group (**Pipeline by Stage**, **Win / Loss**), and
  — for administrators — an **Admin** group (**Overview**, **Users & roles**,
  **Pipeline stages**, **CSV import**, **Recovery**).
- **Collapse the sidebar** with the chevron at its foot to gain screen space;
  Custotal remembers your choice.
- **Top bar:** a global **Search** box (_"Search customers, deals, tasks…"_), a
  **tasks inbox icon** with a badge counting work due today plus overdue, and
  your name menu with **Change password** and **Sign out**.
- **Small screens:** the sidebar becomes a menu you open from the top bar, and
  search collapses to an icon that opens the full search page.

---

## 6. The Dashboard

The Dashboard is your home page and your daily starting point. It greets you by
name and summarizes your pipeline for today.

**Four summary cards**

| Card                   | What it tells you                                                   |
| ---------------------- | ------------------------------------------------------------------- |
| **Open pipeline**      | The total value of your open deals, and how many there are.         |
| **Closing this month** | How many open deals are expected to close this month.               |
| **Tasks due today**    | Your open follow-ups due today.                                     |
| **Won this month**     | Revenue closed this month (won deals expected to close this month). |

**Two working panels**

- **Open pipeline** — your five largest open deals, largest first. Each row shows
  the deal, its account, its stage, its value, and its expected close date. Click
  a row to open the deal, or **View board** to go to the pipeline.
- **Follow-ups** — your next five open tasks by due date, with a dot that turns
  red when a task is overdue. Click **All tasks** to see everything.

> **Tip:** Make the Dashboard your morning check-in. **Follow-ups** tells you
> what needs attention today, and **Open pipeline** tells you where your biggest
> opportunities stand.

---

## 7. Contacts

Contacts are the people you work with. Open **Contacts** in the sidebar.

### 7.1 Browsing and filtering

The list shows **Name**, **Company / Account**, **Email**, **Status**, and
**Modified** (the last two columns appear on wider screens). You can narrow it
down with:

- A **search box** (_"Search by name, email…"_).
- A **Status** filter: **All statuses**, **Active**, or **Inactive**.
- An **Owner** filter: **All owners** or a specific teammate.
- A **letter** filter (the last name's first letter) to jump through a long list.

Click the **Name** or **Modified** column heading to sort; click again to reverse
the order. Results are paged 25 at a time with **Previous** and **Next**.

### 7.2 Adding a contact

1. Click **New contact**.
2. In the **Profile** section, fill in the fields. **First name** and **Last name**
   are required.
3. Add an **Email** and/or **Phone**. At least one of the two is required — a
   contact with neither is not saved.
4. Optionally add **Job title**, **Company**, **Address**, and **Notes**, and set
   the **Status** (**Active** by default).
5. In the **Linked accounts** section, click **Add account** to connect the
   person to the organization(s) they belong to. For each link, choose the
   **Account**, type their **Role** (for example "Decision maker"), and tick
   **Primary** for their main account.
6. Click **Create contact**.

**Field rules at a glance**

- First name and last name are always required.
- If you enter an email, it must be a valid address.
- Email or phone — at least one is required.
- When you save with one or more linked accounts, exactly one can be marked
  **Primary**; marking a new link primary unchecks the others.

### 7.3 The contact page

Opening a contact shows everything about them on one screen:

- **Left:** a **Log an interaction** form and the contact's full **Timeline** of
  activity (see [§9](#9-interactions--logging-what-happened)).
- **Right:** **Contact details** (email, phone, address, notes), **Linked
  accounts** (each with its **Primary** badge and role), and **Record history**
  (who created it and who last modified it).

Buttons in the header:

| Button          | What it does                                                                     |
| --------------- | -------------------------------------------------------------------------------- |
| **Export data** | Downloads this one contact's details as a JSON file (useful for a data request). |
| **Edit**        | Opens the contact for editing.                                                   |
| **Delete**      | Moves the contact to Recovery (restorable for 30 days).                          |

### 7.4 Editing and deleting

- **Edit** a contact from its page, change any fields, and click **Save changes**.
- **Delete** a contact from its page and confirm. The contact disappears from the
  list and can be restored by an administrator for 30 days.

### 7.5 Exporting the list

Click **Export** at the top of the Contacts list to download a CSV of the
contacts currently in view — your search and filters are respected. The file has
these columns: First name, Last name, Email, Phone, Job title, Company, Status,
Last modified. Very large exports (tens of thousands of rows) are capped, so
narrow the filters first if you need a specific set.

---

## 8. Accounts

Accounts are the organizations you sell to. Open **Accounts** in the sidebar.

### 8.1 Browsing and filtering

The Accounts list is shown as cards, each displaying the account name, industry
(or _"No industry"_), its owner, and website. You can filter by:

- A **search box** (_"Search accounts…"_).
- **Owner** (**All owners** or a teammate).
- A **letter** filter (first letter of the account name).
- A **Sort** menu: **Name A–Z**, **Name Z–A**, **Recently modified**, or
  **Oldest modified**.

### 8.2 Adding an account

1. Click **New account**.
2. Fill in **Account name** (required), then optionally **Industry**, **Website**,
   **Phone**, **Billing address**, and **Notes**.
3. Choose an **Owner** — it defaults to you.
4. Click **Create account**.

### 8.3 The account page

An account page gathers everything about the relationship:

- **Left:** a **Log an interaction** form (with a contact chooser) and the
  account's **Timeline**.
- **Right:** **Account details**, **Contacts**, **Opportunities**, and **Record
  history**.

**Linking a contact to an account**

1. In the **Contacts** card, click **Link contact**.
2. Choose a **Contact** (only people not already linked appear).
3. Type the **Relationship** — free text such as "Decision maker", "Champion",
   or "Legal review".
4. Tick **Primary contact for this account** if this is the main point of
   contact, then click **Link contact**.

To remove a link, hover over the contact row and click the unlink button. The
contact itself is kept — only the connection is removed.

**Viewing deals for the account**

The **Opportunities** card lists every deal attached to the account, with its
close date, stage, and value. Click one to open it.

### 8.4 Editing and deleting

- **Edit** an account from its page and click **Save changes**.
- **Delete** an account from its page and confirm. Like a contact, it is
  recoverable for 30 days.

### 8.5 Exporting the list

Click **Export** on the Accounts list for a CSV with: Account name, Industry,
Website, Phone, Billing address, Owner, Last modified. Your current search,
owner, letter, and sort settings are respected.

---

## 9. Interactions — logging what happened

Interactions are how your team builds a shared memory of every customer
conversation. They appear on the **Timeline** of a contact, an account, and a
deal — the same entry is visible from each related record.

### 9.1 Logging an interaction in seconds

The **Log an interaction** form sits on a contact, account, or deal page:

1. **Contact** — on an account or deal page, choose who the interaction was
   with. (On a contact's own page, the contact is implied.)
2. **Type** — **Call**, **Email**, **Meeting**, **Note**, or **Other**. The
   default is **Call**.
3. **Direction** — **Inbound** (they contacted you) or **Outbound** (you
   contacted them). This field is hidden for a **Note**, which has no direction.
4. **Summary** — describe what happened (_"What happened?"_).
5. Click **Save interaction**.

The entry appears at the top of the timeline immediately, stamped with your name
and the time.

> **Best practice:** log the interaction while it is fresh — a one-line summary
> is enough. The value is in the pattern over weeks, not in perfect prose.

### 9.2 Reading the timeline

The timeline is newest-first and can be paged with **Load more**. Each entry
shows its **type** (Email, Call, Meeting, Note, Other), the **direction** where
applicable, the date and time, who was responsible, and the summary.

### 9.3 Editing and deleting

Hover over a timeline entry to reveal its controls:

- **Sales Reps** can edit or delete the interactions they logged or are
  responsible for.
- **Managers** and **Administrators** can edit or delete any interaction.
- **Read-Only** users see no controls.

Deleting an interaction removes it from the timeline but keeps it recoverable by
an administrator for 30 days.

> **Consistency tip:** put the customer's exact words or the key decision in the
> **Summary**. That phrase is also searchable later (see [§10.3](#103-search)),
> which turns your timeline into a knowledge base.

---

## 10. The pipeline and deals

### 10.1 Pipeline and deals

Open **Pipeline** in the sidebar to see every deal on a board, one column per
stage.

**Two ways to look at the same data**

- **Board** — a kanban board. Each column is a stage; each card is a deal showing
  its name, account, value, owner, and expected close date.
- **List** — a sortable table of **Deal**, **Value**, **Close date**, **Stage**,
  and **Owner**.

Switch with the **Board** / **List** toggle. If you can see the whole team's
deals, you also get an **Owner** filter; everyone gets a **Stage** filter and a
running summary of deal count and total value.

**Creating a deal**

1. Click **New deal**.
2. Fill in **Deal name** (required) and choose the **Account** (required).
3. Optionally pick a **Contact**, then set the **Value**, **Expected close date**,
   **Stage**, **Probability**, and **Owner**, and add a **Description**.
4. Click **Create deal**.

The **Probability** field shows **"Auto from stage"** when it follows the stage
default, or **"Manually set"** when you have overridden it. Changing the stage
resets the probability to that stage's default; editing the probability yourself
marks it as manual.

**Moving a deal through the pipeline**

Drag a card from one column to another — or use the **stage selector** on the
card itself. Two behaviors to expect:

- If the target stage is typically closed as **lost**, Custotal asks you to
  confirm and lets you record a **loss reason** (_"Why was this deal lost?"_).
- If you had previously set the probability **manually**, Custotal asks whether
  to **Use** the new stage's default or **Keep** your manual value.

Every move is recorded. The deal's own page has a **Stage history** card listing
each transition (_"Moved from Proposal to Negotiation"_) with who made it and
when — so the journey of a deal is never a mystery.

**The deal page**

Opening a deal shows:

- Its **Description** and, if it was lost, its **Loss reason**.
- A **Log an interaction** form and the deal's **Timeline**.
- **Deal details** — account, contact, owner, expected close, probability, and
  value.
- **Stage history** — the full record of stage changes.

**Exporting deals**

Click **Export** on the pipeline to download a CSV of the deals in view: Deal,
Account, Value, Close date, Stage, Owner.

> **Forecast tip:** because each stage carries a default win probability, the
> **Weighted value** in the pipeline report reflects those probabilities. Keep
> stage defaults realistic and the forecast looks after itself.

### 10.2 Tasks

Open **Tasks** in the sidebar. Tasks are your follow-ups — the mechanism that
stops a deal going quiet.

**Two views**

- **My tasks** — tasks assigned to you (this is the default).
- **All tasks** — every task across the team. Managers, administrators, and
  Read-Only users can switch views; a Sales Rep always sees their own.

**Filtering and sorting**

- **Status**: All statuses, Open, Completed.
- **Priority**: All priorities, High, Medium, Low.
- **Owner** (in the All tasks view): All owners or a teammate.
- **Related**: All related records, Linked to a contact, Linked to an account,
  Linked to a deal, or No linked record.
- **Sort**: Due date (default), Priority, or Created.

**Creating a task**

1. Click **New task**.
2. Enter a **Title** (required) and optional **Description**.
3. Set a **Due date**, a **Priority** (**Medium** by default), and an
   **Assignee** (defaults to you).
4. Optionally link the task to an **Account**, **Contact**, and **Deal**.
5. Click **Create task**.

**Completing and reopening**

Click the round button on a task row to complete it — the check turns green and
the title is struck through. Click again to reopen it. Custotal records every
completion, so you can open a task's **completion history** (the clock button) to
see each time it was completed, by whom, and when — even after it was reopened.

**Overdue work**

An open task past its due date shows its date in red with _"· overdue"_. The
top-bar tasks badge counts the work due today plus everything overdue, so overdue
items are hard to miss.

> **Discipline tip:** give every open deal a next-action task with a due date.
> The Dashboard **Follow-ups** panel and the header badge will keep it in front
> of you.

### 10.3 Search

Use the global **Search** box in the top bar — or open the full **Search** page.
Search finds, in one pass:

- **Contacts** (by name, email, and details)
- **Accounts**
- **Deals**
- **Tasks**
- **Interactions** (matching the text of your logged notes)

Type at least **two characters**. Results are grouped by type with a count, and
each result links straight to the record.

> **Remember:** search respects your role. A Sales Rep's results only include
> deals, tasks, and interactions they are allowed to see.

### 10.4 Reports

Reports live under the **Reports** heading in the sidebar and share the same tab
strip, so you can switch between them quickly.

**Pipeline by stage** (`Reports → Pipeline by Stage`)

- Shows, for each stage, the **Deals** count, **Total value**, and **Weighted
  value** (value × probability), with a bar chart of total value per stage.
- Filter by **Owner** (if you can see the team) and by a **Close date** range
  (**from** … **to**).
- Click **Export CSV** for a `pipeline-by-stage.csv` file.

**Win / Loss** (`Reports → Win / Loss`)

- Five summary cards: **Won deals**, **Lost deals**, **Win rate**, **Won value**,
  and **Lost value**.
- A **Closed value** chart comparing won and lost value.
- A **Loss reasons** list summarizing why deals were lost, each with a count.
- Filter by **Owner** and **Close date** range, and click **Export CSV** for a
  `win-loss-report.csv` file.

Both reports open in Excel cleanly (files are written so spreadsheet apps read
them correctly). Use them for pipeline reviews, forecasts, and retrospectives.

---

## 11. Administrator tasks

Everything in this section requires the **Administrator** role and appears under
the **Admin** group in the sidebar.

### 11.1 Users & roles

**Admin → Users & roles** lists everyone who can sign in.

**Adding a teammate**

1. Click **New user**.
2. Enter their **Full name** (required) and **Email** (required; used to sign in).
3. Choose a **Role** (**Sales Rep** by default).
4. Click **Create user & send invite**.

Custotal emails the new user a one-time link to set their own password. If email
delivery is unavailable, it instead creates a **temporary password**, shown to you
**once**, which the teammate uses to sign in and is then forced to change. Copy
it immediately and share it over a secure channel.

**Changing a role** — use the role dropdown on the user's row; the change applies
right away and a confirmation message appears.

**Editing or removing a user** — use the **Edit** (pencil) or **Delete** (trash)
buttons on the row. Your own row is locked so you cannot remove yourself. A user
who still **owns accounts, deals, or tasks** cannot be deleted until those
records are reassigned. The last remaining administrator cannot be deleted or
demoted.

### 11.2 Pipeline stages

**Admin → Pipeline stages** configures the single sales pipeline. A fresh
workspace starts with: **Lead** (10%), **Qualified** (30%), **Proposal** (50%),
**Negotiation** (75%), **Won** (100%), and **Lost** (0%).

For each stage you can set:

- **Stage name** (must be unique),
- **Default win probability** (0–100), and
- **Classification** — **Open**, **Won**, or **Lost**.

**Reorder** stages with the up/down arrows to match how your team actually
sells; new stages are appended to the end.

**Delete** a stage with the trash button — but a stage that still holds deals is
**locked** so you cannot delete it by accident. Move or close those deals first.
Renaming a stage is always allowed, and existing deals simply inherit the new
name.

> **Why it matters:** stage defaults drive the deal probability and the
> **Weighted value** in your reports. Adjust them to reflect your real win rates
> so the forecast stays honest.

### 11.3 CSV import

**Admin → CSV import** brings contacts or accounts in from a spreadsheet, with
validation before anything is saved. The wizard has four steps: **Upload → Map
columns → Review → Done**.

1. **Upload.** Choose whether you are importing **Contacts** or **Accounts**, then
   drop in a CSV file (up to 10 MB, with a header row and at least one data row).
   Download the matching **template** if you want a ready-made column layout.
2. **Map columns.** Match each spreadsheet column to a Custotal field. Unmapped
   columns are ignored. **Auto-map** makes a best guess from your headers. Map a
   column to **Owner email** to assign ownership; if an owner email does not match
   a user, the importing administrator becomes the owner. Save the layout as a
   **mapping template** to reuse next time.
3. **Review.** Custotal runs a **dry run** — nothing is saved yet. Each row is
   marked **Ready**, **Existing** (a duplicate), or **Invalid** (with reasons).
   For contacts, choose what to do with duplicate emails: **Skip existing emails**
   or **Overwrite existing**. (Accounts are always created fresh.)
4. **Import and Done.** Click **Import** to commit. The summary shows how many
   records were **Created**, **Updated**, **Skipped**, and **Failed**.

> **Before a big import:** run it on a small sample file first. The dry run is
> your safety net — read the row-level reasons it reports before committing.

### 11.4 Recovery (the 30-day trash)

**Admin → Recovery** lists soft-deleted **Contacts**, **Accounts**, **Deals**,
**Tasks**, and **Interactions**, newest first, with what each one was and when it
was deleted.

- **Restore** puts a record back where it was.
- **Purge** permanently deletes it — this cannot be undone.

Records older than **30 days** are purged automatically, so restore anything you
need before the window closes. A record that is still referenced by other data
(a contact with linked deals or tasks, for example) cannot be purged until those
references are cleared; Custotal tells you what is in the way.

---

## 12. Common business workflows

These end-to-end scenarios show how the pieces fit together. Adapt the names and
values to your own business.

### Workflow A — Onboard a new account and its buying committee

**Goal:** capture a new organization and the people who will influence the deal.

1. **Create the account.** **Accounts → New account**, enter the name and any
   industry/website details, set the **Owner** to the rep who will run it, and
   save.
2. **Add the contacts.** For each person, **Contacts → New contact**, fill in
   name plus email or phone, and save.
3. **Link them to the account.** On each contact's page, or from the account's
   **Contacts** card via **Link contact**, connect the person and record their
   **Role** (e.g. "Champion"). Mark the main point of contact **Primary**.
4. **Log the discovery call.** On the account timeline, **Log an interaction** —
   type **Call**, direction **Outbound**, and a one-line summary.
5. **Create the deal.** **Pipeline → New deal**, attach the account and the
   primary contact, set a value and expected close date, and choose the opening
   stage (typically **Lead** or **Qualified**).
6. **Set the next action.** Add a task — _"Send proposal to buying committee"_ —
   with a due date and yourself as assignee.

**Outcome:** the account, its people, its history, its deal, and the next step
all exist in one place from day one.

### Workflow B — Work an inbound lead to a close

**Goal:** take a lead from first contact to a won deal without losing the thread.

1. **Log the first touch.** From the lead's contact page, **Log an interaction**
   (type **Call** or **Email**, direction **Inbound**).
2. **Qualify and advance.** When the lead is real, create or open the deal and
   drag its card from **Lead** to **Qualified**. Custotal updates the probability.
3. **Keep the timeline alive.** After every call, email, or meeting, add an
   interaction. Attach documents by summary — for example _"Sent revised pricing
   (v3) — awaiting legal review"_.
4. **Move the deal deliberately.** Drag it through **Proposal** and
   **Negotiation**, confirming the probability prompt each time.
5. **Close it.**
   - **Won:** drag the deal to your **Won** stage. It now counts toward won value
     and the Win / Loss report.
   - **Lost:** drag it to **Lost**, confirm, and record the **loss reason**. Loss
     reasons feed the Win / Loss report so the team can learn from them.
6. **Capture the next action every time.** After each stage move, add a task with
   a due date.

**Outcome:** a complete, searchable history of the deal and a trustworthy
forecast.

### Workflow C — Run a weekly pipeline review (manager)

**Goal:** understand the pipeline in minutes and focus the team on what matters.

1. **Open the Dashboard** to see total open pipeline, what is closing this month,
   and your overdue follow-ups.
2. **Open Reports → Pipeline by Stage.** Set the **Close date** range to this
   quarter and review **Deals**, **Total value**, and **Weighted value** per
   stage. Click **Export CSV** if you want the numbers in a spreadsheet.
3. **Open Reports → Win / Loss** for the same period. Check the **Win rate** and
   read the **Loss reasons** list.
4. **Open the Pipeline** and switch to **List** view, sorted by value, to spot
   large deals that have not moved. Filter by **Owner** to review each rep's book.
5. **Review Tasks → All tasks** for anything overdue, and reassign as needed.

**Outcome:** a data-driven review that produces specific actions rather than
status conversation.

### Workflow D — Recover a record someone deleted by mistake

**Goal:** undo an accidental deletion.

1. As an administrator, open **Admin → Recovery**.
2. Find the record under its type (Contacts, Accounts, Deals, Tasks, or
   Interactions).
3. Click **Restore**.

If the deletion was more than 30 days ago the record is already purged and cannot
be recovered. If you need it gone for good, use **Purge** instead.

### Workflow E — Bring an existing spreadsheet into Custotal

**Goal:** migrate a contact or account list from a spreadsheet or another tool.

1. As an administrator, open **Admin → CSV import**.
2. Choose **Contacts** or **Accounts**, and download the **template** to see the
   expected columns.
3. Drop in your CSV and **Map columns**, using **Auto-map** as a starting point,
   then save a **mapping template** for next time.
4. Read the **Review** dry run carefully — fix the rows marked **Invalid**, and
   choose how to handle **Existing** duplicates (**Skip** or **Overwrite**).
5. Click **Import** and confirm the Created / Updated / Skipped / Failed counts.

**Outcome:** your existing data is live, validated, and ready to work.

---

## 13. Best practices

**Data hygiene**

- **One contact, one record.** Before adding a person, search for them first so
  you do not create duplicates.
- **Link contacts to accounts.** A contact without an account is easy to lose;
  the account is what keeps people, deals, and history together.
- **Mark the primary contact.** Use **Primary** on the account's main contact so
  anyone can see who the relationship runs through.
- **Keep statuses honest.** Set a contact **Inactive** when they leave a company
  rather than deleting them — the history stays intact.

**Pipeline discipline**

- **Move deals as they really are.** The forecast is only as good as the stage
  data. Update stages promptly, and do not park deals in optimistic stages.
- **Always record a loss reason.** It costs ten seconds and turns every loss into
  something the team can learn from.
- **Trust the stage defaults.** Only override a deal's probability (**Manually
  set**) when you have a specific reason; otherwise let the stage speak.

**Follow-up habits**

- **Every open deal should have a next-action task with a due date.** This is the
  single most effective way to stop deals going quiet.
- **Work from the top-bar badge.** It counts today's tasks plus overdue ones.
- **Clear the Dashboard each morning.** The Follow-ups panel is your daily list.

**Logging**

- **Log while it is fresh.** A one-line summary beats a perfect entry tomorrow.
- **Use the right type.** Meetings, calls, and emails tell a different story than
  notes; accurate types make the timeline readable.
- **Write searchable summaries.** Mention names, numbers, and decisions — those
  words become searchable later.

**Just enough process**

- **Keep the pipeline simple.** Five or six stages that match how you sell beat a
  dozen that nobody maintains.
- **Review weekly, not daily.** Use the reports for a standing weekly rhythm
  rather than constant re-forecasting.

---

## 14. Troubleshooting and FAQ

**I don't see the Admin area.**
Only administrators have it. If you need admin access, ask an existing
administrator to change your role.

**I can't see a colleague's deals or tasks.**
If you are a **Sales Rep**, deals, tasks, and interactions are owner-scoped —
you see your own. Managers, administrators, and Read-Only users see the whole
team. Contacts and accounts are shared with everyone.

**"Invalid email or password" but I'm sure I typed it correctly.**
Passwords are case-sensitive. After several failures, sign-in pauses briefly;
wait a minute. If you still cannot get in, use **Forgot password?**.

**I didn't receive an invitation or reset email.**
Check your spam folder. If nothing arrives, your administrator can create a
**temporary password** for you instead. (Whether email is sent at all depends on
how your workspace's server is configured.)

**I deleted a contact/account/deal/task by mistake.**
Ask an administrator to restore it from **Admin → Recovery**. It is recoverable
for 30 days.

**Why can't I delete this stage or user?**
A pipeline stage that still holds deals is locked — move or close those deals
first. A user who still owns accounts, deals, or tasks cannot be deleted until
their records are reassigned. The last remaining administrator cannot be removed.

**Why can't an administrator purge this record?**
It is still referenced by other data (for example, a contact with linked deals or
tasks). Remove or reassign those references first; Custotal explains what is in
the way.

**My import rows are marked "Invalid".**
The Review step lists the reason for each row — a missing required field or a
malformed email, for example. Fix the row in your spreadsheet, re-upload, and run
the dry run again.

**The numbers in the Win / Loss report don't match what I expect.**
Check the **Close date** range and the **Owner** filter. The report counts won
and lost deals by their expected close date within the range you have set.

**Can I use Custotal on my phone?**
Yes, in a mobile browser — the layout adapts and the sidebar becomes a menu. There
is no separate mobile app.

**Can our team run more than one pipeline?**
No. Custotal has a single configurable pipeline per workspace, by design.

**Can we sign up for an account ourselves?**
No. Custotal is self-hosted and has no registration page; an administrator creates
every account.

---

## 15. Quick reference

**Navigation**

| Where                           | What you'll find                                               |
| ------------------------------- | -------------------------------------------------------------- |
| **Dashboard**                   | Daily summary: pipeline KPIs, top open deals, follow-ups.      |
| **Contacts**                    | People; search, status/owner/letter filters; CSV export.       |
| **Accounts**                    | Organizations; linked contacts and deals; CSV export.          |
| **Pipeline**                    | Deal board (kanban) and list; drag between stages; CSV export. |
| **Tasks**                       | My / All views; complete and reopen; completion history.       |
| **Reports → Pipeline by Stage** | Deals, total value, weighted value per stage.                  |
| **Reports → Win / Loss**        | Win rate, won/lost value, loss reasons.                        |
| **Admin → Users & roles**       | Create users, assign roles, remove users.                      |
| **Admin → Pipeline stages**     | Add, rename, reorder, and configure stages.                    |
| **Admin → CSV import**          | Import contacts and accounts from a spreadsheet.               |
| **Admin → Recovery**            | Restore or purge soft-deleted records (30 days).               |

**Roles at a glance**

| Role          | Writes? | Sees everything?                                       |
| ------------- | ------- | ------------------------------------------------------ |
| Administrator | Yes     | Yes                                                    |
| Manager       | Yes     | Yes                                                    |
| Sales Rep     | Yes     | Contacts/accounts only; own deals, tasks, interactions |
| Read-Only     | No      | Yes (view only)                                        |

**Field and limit reminders**

| Item                  | Rule                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| Contact               | First name + last name required; email or phone required; valid email if provided. |
| Account               | Name required.                                                                     |
| Deal                  | Name and account required; probability 0–100.                                      |
| Task                  | Title required.                                                                    |
| Stage                 | Name unique; probability 0–100; classification Open / Won / Lost.                  |
| Interaction           | Summary up to 5,000 characters; direction hidden for Notes.                        |
| Search                | Minimum 2 characters.                                                              |
| List pages            | 25 rows per page (contacts and accounts).                                          |
| Soft-delete retention | 30 days before automatic purge.                                                    |
| Session               | Signs out after about 8 hours of inactivity.                                       |

**Default pipeline**

| Stage       | Default win probability | Classification |
| ----------- | ----------------------- | -------------- |
| Lead        | 10%                     | Open           |
| Qualified   | 30%                     | Open           |
| Proposal    | 50%                     | Open           |
| Negotiation | 75%                     | Open           |
| Won         | 100%                    | Won            |
| Lost        | 0%                      | Lost           |

**Where to get help**

- For access, role, pipeline-configuration, or data-recovery questions, ask your
  workspace **administrator**.
- For how the server is run, configured, backed up, or upgraded, see
  [Self-hosting](self-hosting.md) and the
  [operations notes](../packages/backend/docs/operations-notes.md).
