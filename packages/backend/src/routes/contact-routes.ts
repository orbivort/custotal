import { Router } from 'express';
import * as contactService from '../services/contact-service.ts';
import { requireCanEdit, requireUser, authedUser } from '../middleware/auth.ts';
import { pstr, qnum, qstr } from '../lib/query.ts';

export const contactRouter = Router();

contactRouter.use(requireUser);

contactRouter.get('/', async (req, res) => {
  const result = await contactService.listContacts({
    q: qstr(req.query.q),
    status: qstr(req.query.status),
    owner: qstr(req.query.owner),
    letter: qstr(req.query.letter),
    sort: qstr(req.query.sort),
    page: qnum(req.query.page),
    pageSize: qnum(req.query.pageSize),
  });
  res.json(result);
});

contactRouter.get('/:id', async (req, res) => {
  res.json(await contactService.getContact(pstr(req.params.id)));
});

contactRouter.post('/', requireCanEdit, async (req, res) => {
  const created = await contactService.createContact(req.body ?? {}, authedUser(req));
  res.status(201).json(created);
});

contactRouter.patch('/:id', requireCanEdit, async (req, res) => {
  const updated = await contactService.updateContact(
    pstr(req.params.id),
    req.body ?? {},
    authedUser(req),
  );
  res.json(updated);
});

contactRouter.delete('/:id', requireCanEdit, async (req, res) => {
  await contactService.softDeleteContact(pstr(req.params.id));
  res.json({ ok: true });
});

contactRouter.get('/:id/export', async (req, res) => {
  res.json(await contactService.exportContact(pstr(req.params.id)));
});
