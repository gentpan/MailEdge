import { ContactRound, Loader2, Mail, RefreshCw, Save, Search, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { api, type Contact } from "../lib/api";
import { useAsyncList } from "../lib/useAsyncList";

interface Props {
  onChanged?: () => void;
}

interface Draft {
  email: string;
  name: string;
  company: string;
  notes: string;
}

const EMPTY_DRAFT: Draft = { email: "", name: "", company: "", notes: "" };

function draftFrom(contact: Contact): Draft {
  return {
    email: contact.email,
    name: contact.name,
    company: contact.company ?? "",
    notes: contact.notes ?? "",
  };
}

function initials(contact: Pick<Contact, "name" | "email">): string {
  return Array.from(contact.name.trim() || contact.email)[0]?.toUpperCase() ?? "?";
}

export default function ContactsView({ onChanged }: Props) {
  const { t } = useI18n();
  const fetchContacts = useCallback(() => api.contacts().then((result) => result.contacts), []);
  const { items, loading, loadError, load } = useAsyncList<Contact>(fetchContacts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newContact, setNewContact] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((contact) =>
      [contact.name, contact.email, contact.company ?? ""].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [items, search]);

  const active = items.find((contact) => contact.id === selectedId) ?? null;

  useEffect(() => {
    if (!newContact && selectedId && !active) setSelectedId(null);
  }, [active, newContact, selectedId]);

  function selectContact(contact: Contact) {
    setNewContact(false);
    setSelectedId(contact.id);
    setDraft(draftFrom(contact));
    setNotice(null);
  }

  function startNew() {
    setSelectedId(null);
    setNewContact(true);
    setDraft(EMPTY_DRAFT);
    setNotice(null);
  }

  async function saveContact() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        email: draft.email,
        name: draft.name,
        company: draft.company,
        notes: draft.notes,
      };
      if (newContact) {
        const result = await api.createContact(payload);
        setNewContact(false);
        setSelectedId(result.contact.id);
        setDraft(draftFrom(result.contact));
        setNotice({ type: "success", text: t("contacts.created") });
      } else if (active) {
        const result = await api.updateContact(active.id, payload);
        setSelectedId(result.contact.id);
        setDraft(draftFrom(result.contact));
        setNotice({ type: "success", text: t("contacts.updated") });
      }
      await load();
      onChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("toast.actionFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function removeContact() {
    if (!active || saving || !window.confirm(t("contacts.deleteConfirm"))) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.deleteContact(active.id);
      setSelectedId(null);
      setNewContact(false);
      setDraft(EMPTY_DRAFT);
      setNotice({ type: "success", text: t("contacts.deleted") });
      await load();
      onChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("toast.actionFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="list-pane contacts-list-pane">
        <div className="list-pane__header contacts-list-pane__header">
          <div>
            <h3 className="list-pane__heading">{t("contacts.title")}</h3>
            <p className="contacts-list-pane__count">{items.length}</p>
          </div>
          <div className="contacts-list-pane__actions">
            <button
              className="btn btn--icon"
              type="button"
              aria-label={t("common.refresh")}
              title={t("common.refresh")}
              onClick={() => void load()}
            >
              <RefreshCw size={16} />
            </button>
            <button className="btn btn--primary btn--sm" type="button" onClick={startNew}>
              <UserPlus size={15} />
              {t("contacts.add")}
            </button>
          </div>
        </div>

        <label className="contacts-search">
          <Search size={15} aria-hidden="true" />
          <input
            className="contacts-search__input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("contacts.search")}
            aria-label={t("contacts.search")}
          />
        </label>

        <div className="list-pane__body contacts-list-pane__body">
          {loading && (
            <div className="empty">
              <Loader2 size={20} className="spin" />
              <p>{t("list.loading")}</p>
            </div>
          )}
          {!loading && loadError && (
            <div className="empty">
              <p>{t("list.loadError")}</p>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => void load()}>
                {t("common.refresh")}
              </button>
            </div>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <div className="empty contacts-empty">
              <ContactRound size={32} />
              <p>{items.length ? t("contacts.search") : t("contacts.empty")}</p>
              {!items.length && <p className="text-xs">{t("contacts.empty.hint")}</p>}
            </div>
          )}
          {filtered.map((contact) => (
            <button
              className={`contact-row${active?.id === contact.id ? " contact-row--active" : ""}`}
              key={contact.id}
              type="button"
              onClick={() => selectContact(contact)}
            >
              <span className="contact-row__avatar">{initials(contact)}</span>
              <span className="contact-row__body">
                <span className="contact-row__name">{contact.name}</span>
                <span className="contact-row__email">{contact.email}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-pane contacts-detail-pane">
        {!active && !newContact ? (
          <div className="empty">
            <ContactRound size={32} />
            <p>{t("contacts.pick")}</p>
          </div>
        ) : (
          <div className="detail-pane__body contacts-detail__body">
            <div className="contacts-detail__content">
              <header className="detail-header contacts-detail__header">
                <div className="contacts-detail__title-row">
                  <span className="contacts-detail__icon">
                    {newContact ? <UserPlus size={18} /> : <ContactRound size={18} />}
                  </span>
                  <div>
                    <h2 className="detail-header__subject">
                      {newContact ? t("contacts.new") : active?.name}
                    </h2>
                    <p className="contacts-detail__description">{t("contacts.description")}</p>
                  </div>
                </div>
              </header>

              {notice && <div className={`alert alert--${notice.type}`}>{notice.text}</div>}

              <form
                className="contacts-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveContact();
                }}
              >
                <label className="field">
                  <span className="field__label">{t("contacts.name")}</span>
                  <input
                    className="input"
                    value={draft.name}
                    maxLength={80}
                    placeholder={t("contacts.name.placeholder")}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field__label">{t("contacts.email")}</span>
                  <input
                    className="input"
                    type="email"
                    value={draft.email}
                    maxLength={320}
                    placeholder={t("contacts.email.placeholder")}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field__label">{t("contacts.company")}</span>
                  <input
                    className="input"
                    value={draft.company}
                    maxLength={80}
                    placeholder={t("contacts.company.placeholder")}
                    onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="field__label">{t("contacts.notes")}</span>
                  <textarea
                    className="textarea"
                    value={draft.notes}
                    maxLength={1000}
                    placeholder={t("contacts.notes.placeholder")}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <div className="form-actions contacts-form__actions">
                  <button className="btn btn--primary" type="submit" disabled={saving}>
                    {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                    {newContact ? t("contacts.save") : t("contacts.update")}
                  </button>
                  {active && (
                    <button
                      className="btn btn--danger"
                      type="button"
                      disabled={saving}
                      onClick={() => void removeContact()}
                    >
                      <Trash2 size={15} />
                      {t("contacts.delete")}
                    </button>
                  )}
                </div>
              </form>

              {active && (
                <div className="contacts-detail__hint">
                  <Mail size={15} />
                  <span>{active.email}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
