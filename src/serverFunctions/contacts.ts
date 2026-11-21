import { createServerFn } from "@tanstack/react-start";
import * as q from "@/server/contacts";
import { orNull } from "@/server/request";
import { userMiddleware } from "./middleware";

export const listContacts = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => q.contactFilter.parse(d))
  .handler(({ data, context }) => orNull(() => q.listContacts(context.user.id, data)));

export const getContact = createServerFn()
  .middleware([userMiddleware])
  .validator((d: unknown) => q.contactRef.parse(d))
  .handler(({ data, context }) => orNull(() => q.getContact(context.user.id, data.newsletterId, data.contactId)));

export const addContact = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.addContactInput.parse(d))
  .handler(({ data, context }) => q.addContact(context.user.id, data));

export const updateContact = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.updateContactInput.parse(d))
  .handler(({ data, context }) => q.updateContact(context.user.id, data));

export const setContactStatus = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.setStatusInput.parse(d))
  .handler(({ data, context }) => q.setStatus(context.user.id, data));

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.contactRef.parse(d))
  .handler(({ data, context }) => q.deleteContact(context.user.id, data));

export const bulkContacts = createServerFn({ method: "POST" })
  .middleware([userMiddleware])
  .validator((d: unknown) => q.bulkInput.parse(d))
  .handler(({ data, context }) => q.bulk(context.user.id, data));
