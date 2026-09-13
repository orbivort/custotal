import { Router } from 'express';
import * as accountService from '../services/account-service.ts';
import { requireCanEdit, requireUser, authedUser } from '../middleware/auth.ts';
import { pstr, qnum, qstr } from '../lib/query.ts';

export const accountRouter = Router();

accountRouter.use(requireUser);

accountRouter.get('/', async (req, res) => {
  res.json(
    await accountService.listAccounts({
      q: qstr(req.query.q),
      owner: qstr(req.query.owner),
      letter: qstr(req.query.letter),
      sort: qstr(req.query.sort),
      page: qnum(req.query.page),
      pageSize: qnum(req.query.pageSize),
    }),
  );
});

accountRouter.get('/:id', async (req, res) => {
  res.json(await accountService.getAccount(pstr(req.params.id)));
});

accountRouter.post('/', requireCanEdit, async (req, res) => {
  const created = await accountService.createAccount(req.body ?? {}, authedUser(req));
  res.status(201).json(created);
});

accountRouter.patch('/:id', requireCanEdit, async (req, res) => {
  const updated = await accountService.updateAccount(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(updated);
});

accountRouter.delete('/:id', requireCanEdit, async (req, res) => {
  await accountService.softDeleteAccount(pstr(req.params.id));
  res.json({ ok: true });
});

accountRouter.post('/:id/links', requireCanEdit, async (req, res) => {
  const contact = await accountService.addAccountLink(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(contact);
});

accountRouter.delete('/:id/links/:contactId', requireCanEdit, async (req, res) => {
  const contact = await accountService.removeAccountLink(
    pstr(req.params.id),
    pstr(req.params.contactId),
    authedUser(req),
  );
  res.json(contact);
});
