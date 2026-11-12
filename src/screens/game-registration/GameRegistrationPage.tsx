"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card, FormField } from "@shared/components";
import { AuthorRole, GameCategory, GameLaunchType, GameStatus } from "@shared/enums";
import type { GameRegistration, GameRegistrationInput } from "@shared/types";
import { RequireRole } from "@code/guards";
import {
  registrationCreated,
  registrationDeleted,
  registrationUpdated,
  registrationsLoaded,
  registrationsLoadFailed,
  registrationsLoading,
  selectGameRegistrations,
  selectPlayerProfile,
  useAppDispatch,
  useAppSelector,
} from "@code/state";

const REQUIRED_FIELDS: Array<keyof GameRegistrationInput> = [
  "appName",
  "providerName",
  "description",
  "launchUrl",
  "apiBaseUrl",
  "authEndpoint",
  "balanceEndpoint",
  "addChipsEndpoint",
  "deductChipsEndpoint",
  "credentialReference",
  "signatureAlgorithm",
  "externalUserIdField",
  "transactionIdField",
  "transactionTypeField",
  "gameTypeField",
  "requestIdField",
  "category",
  "launchType",
  "status",
];

const initialForm: GameRegistrationInput = {
  appName: "",
  providerName: "",
  description: "",
  category: GameCategory.Community,
  costPerPlay: 0,
  launchType: GameLaunchType.ExternalUrl,
  status: GameStatus.Active,
  active: true,
  launchUrl: "",
  apiBaseUrl: "",
  authEndpoint: "/auth",
  balanceEndpoint: "/balance",
  addChipsEndpoint: "/add-chips",
  deductChipsEndpoint: "/deduct-chips",
  credentialReference: "",
  signatureAlgorithm: "HMAC-SHA256",
  externalUserIdField: "username",
  transactionIdField: "transId",
  transactionTypeField: "transactionType",
  gameTypeField: "gameType",
  requestIdField: "request_id",
};

const applicationFields: Array<{ key: keyof GameRegistrationInput; label: string; placeholder: string }> = [
  { key: "appName", label: "App name", placeholder: "InBetween Live" },
  { key: "providerName", label: "Provider name", placeholder: "InBetween" },
  { key: "launchUrl", label: "Launch URL", placeholder: "https://games.example.com/inbetween" },
  { key: "apiBaseUrl", label: "API base URL", placeholder: "https://api.example.com" },
];

const integrationFields: Array<{ key: keyof GameRegistrationInput; label: string; placeholder: string }> = [
  { key: "authEndpoint", label: "Authentication endpoint", placeholder: "/auth" },
  { key: "balanceEndpoint", label: "Balance endpoint", placeholder: "/balance" },
  { key: "addChipsEndpoint", label: "Add transaction endpoint", placeholder: "/add-chips" },
  { key: "deductChipsEndpoint", label: "Deduct transaction endpoint", placeholder: "/deduct-chips" },
  { key: "credentialReference", label: "Provider signing secret reference", placeholder: "secret-manager/inbetween-live" },
  { key: "signatureAlgorithm", label: "Signature algorithm", placeholder: "HMAC-SHA256" },
];

const transactionFields: Array<{ key: keyof GameRegistrationInput; label: string; placeholder: string }> = [
  { key: "externalUserIdField", label: "External user ID field", placeholder: "username" },
  { key: "transactionIdField", label: "Transaction ID field", placeholder: "transId" },
  { key: "transactionTypeField", label: "Transaction type field", placeholder: "transactionType" },
  { key: "gameTypeField", label: "Game type field", placeholder: "gameType" },
  { key: "requestIdField", label: "Request ID field", placeholder: "request_id" },
];

function inputClassName(hasError = false) {
  return `rounded-xl border bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:ring-2 ${
    hasError
      ? "border-[var(--coral)] focus:border-[var(--coral)] focus:ring-rose-100"
      : "border-[var(--line)] focus:border-[var(--navy)] focus:ring-emerald-100"
  }`;
}

export function GameRegistrationPage() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectPlayerProfile);
  const registrations = useAppSelector(selectGameRegistrations);
  const [form, setForm] = useState<GameRegistrationInput>(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof GameRegistrationInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ appKey: string; signingSecret: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [revealingAppKey, setRevealingAppKey] = useState<string | null>(null);
  const [editingAppKey, setEditingAppKey] = useState<string | null>(null);
  const [deletingAppKey, setDeletingAppKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    dispatch(registrationsLoading());
    fetch("/api/game-registrations")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load registered apps.");
        dispatch(registrationsLoaded((await response.json()) as GameRegistration[]));
      })
      .catch((error: Error) => dispatch(registrationsLoadFailed(error.message)));
  }, [dispatch]);

  function updateField(field: keyof GameRegistrationInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof GameRegistrationInput, string>> = {};
    REQUIRED_FIELDS.forEach((field) => {
      if (typeof form[field] === "string" && !form[field].trim()) errors[field] = "Required";
    });
    if (!Number.isSafeInteger(form.costPerPlay) || form.costPerPlay < 0) errors.costPerPlay = "Enter a valid non-negative whole-number cost";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) {
      setFormError("Complete every required registration and transaction field.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setNotice(null);
    try {
      const response = await fetch(
        editingAppKey
          ? `/api/game-registrations/${encodeURIComponent(editingAppKey)}`
          : "/api/game-registrations",
        {
        method: editingAppKey ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as { registration?: GameRegistration; credentials?: { appKey: string; signingSecret: string } | null; message?: string };
      if (!response.ok) {
        setFormError("message" in body && body.message ? body.message : "Could not register the app.");
        return;
      }
      if (!body.registration) throw new Error("Registration was not returned.");
      if (editingAppKey) {
        dispatch(registrationUpdated(body.registration));
        setNotice("Registration updated. The App Key and Secret are unchanged.");
      } else {
        if (!body.credentials) throw new Error("Registration credentials were not returned.");
        dispatch(registrationCreated(body.registration));
        setCredentials(body.credentials);
        setNotice("Registration created. Save the generated credentials.");
      }
      setEditingAppKey(null);
      setForm(initialForm);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The registration service is unavailable. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function editRegistration(registration: GameRegistration) {
    setEditingAppKey(registration.appKey);
    setForm({
      appName: registration.appName,
      providerName: registration.providerName,
      description: registration.description,
      category: registration.category,
      costPerPlay: registration.costPerPlay,
      launchType: registration.launchType,
      status: registration.status,
      active: registration.active,
      launchUrl: registration.launchUrl,
      apiBaseUrl: registration.apiBaseUrl,
      authEndpoint: registration.authEndpoint,
      balanceEndpoint: registration.balanceEndpoint,
      addChipsEndpoint: registration.addChipsEndpoint,
      deductChipsEndpoint: registration.deductChipsEndpoint,
      credentialReference: registration.credentialReference,
      signatureAlgorithm: registration.signatureAlgorithm,
      externalUserIdField: registration.externalUserIdField,
      transactionIdField: registration.transactionIdField,
      transactionTypeField: registration.transactionTypeField,
      gameTypeField: registration.gameTypeField,
      requestIdField: registration.requestIdField,
    });
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingAppKey(null);
    setForm(initialForm);
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
  }

  async function deleteRegistration(registration: GameRegistration) {
    const confirmed = window.confirm(
      `Delete ${registration.appName}? It will no longer appear in Game Center, and its App Key will stop working. Provider transaction history will be kept.`,
    );
    if (!confirmed) return;

    setDeletingAppKey(registration.appKey);
    setFormError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/game-registrations/${encodeURIComponent(registration.appKey)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "Could not delete the registration.");
      }
      dispatch(registrationDeleted(registration.appKey));
      if (editingAppKey === registration.appKey) cancelEdit();
      if (credentials?.appKey === registration.appKey) setCredentials(null);
      setNotice(body.message || "Registration deleted. Provider transaction history was retained.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not delete the registration.");
    } finally {
      setDeletingAppKey(null);
    }
  }

  async function revealCredentials(appKey: string) {
    setRevealingAppKey(appKey);
    try {
      const response = await fetch(`/api/game-registrations/${encodeURIComponent(appKey)}/credentials`);
      const body = (await response.json()) as { appKey?: string; signingSecret?: string; message?: string };
      if (!response.ok || !body.appKey || !body.signingSecret) throw new Error(body.message || "Could not reveal app credentials.");
      setCredentials({ appKey: body.appKey, signingSecret: body.signingSecret });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not reveal app credentials.");
    } finally {
      setRevealingAppKey(null);
    }
  }

  return (
    <RequireRole currentRole={profile.role} allowedRoles={[AuthorRole.SuperAdmin]}>
      <section className="flex flex-col gap-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold)]">SuperAdmin integration</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--navy)]">{editingAppKey ? "Edit game app registration" : "Register a game app"}</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            {editingAppKey
              ? "Update the app details and provider contract. The App Key and Secret will stay the same."
              : "Register an external game once, record its launch and API contract, and identify every transaction field the Game Center must preserve."}
          </p>
          <button type="button" onClick={() => setShowInstructions(true)} className="mt-3 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--navy)] hover:bg-[var(--mint)]">Registration instructions</button>
        </header>

        <Card>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
            <div>
              <h3 className="font-semibold text-[var(--navy)]">Application details</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{editingAppKey ? "The generated App Key and Secret are not changed when editing. Enter a reference to the provider-side signing secret, not the secret value." : "The app key and signing secret are generated automatically after registration. Enter a reference to the provider-side signing secret, not the secret value."}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {applicationFields.map((field) => (
                <FormField key={field.key} label={field.label} htmlFor={`registration-${field.key}`} error={fieldErrors[field.key]}>
                  <input
                    id={`registration-${field.key}`}
                    required
                    value={String(form[field.key])}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className={inputClassName(Boolean(fieldErrors[field.key]))}
                  />
                </FormField>
              ))}
              <FormField label="Cost per play" htmlFor="registration-costPerPlay" error={fieldErrors.costPerPlay}>
                <input
                  id="registration-costPerPlay"
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.costPerPlay}
                  onChange={(event) => setForm((current) => ({ ...current, costPerPlay: Number(event.target.value) }))}
                  className={inputClassName(Boolean(fieldErrors.costPerPlay))}
                />
              </FormField>
              <FormField label="Category" htmlFor="registration-category" error={fieldErrors.category}>
                <select id="registration-category" value={form.category} onChange={(event) => updateField("category", event.target.value)} className={inputClassName(Boolean(fieldErrors.category))}>
                  {Object.values(GameCategory).map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </FormField>
              <FormField label="Launch type" htmlFor="registration-launchType" error={fieldErrors.launchType}>
                <input id="registration-launchType" readOnly value={form.launchType} className={inputClassName(Boolean(fieldErrors.launchType))} />
              </FormField>
              <FormField label="Status" htmlFor="registration-status" error={fieldErrors.status}>
                <input id="registration-status" readOnly value={form.status} className={inputClassName(Boolean(fieldErrors.status))} />
              </FormField>
              <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)]">
                <input
                  id="registration-active"
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  className="h-4 w-4 accent-[var(--teal)]"
                />
                <span><strong>Active</strong><span className="ml-1 text-[var(--muted)]">Show as playable in Home</span></span>
              </label>
              <FormField label="Description" htmlFor="registration-description" error={fieldErrors.description}>
                <textarea
                  id="registration-description"
                  required
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  placeholder="Describe the app and its supported game experience."
                  rows={3}
                  className={inputClassName(Boolean(fieldErrors.description))}
                />
              </FormField>
            </div>

            <div className="border-t border-[var(--line)] pt-5">
              <h3 className="font-semibold text-[var(--navy)]">Integration contract</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">These fields describe how the Game Center authenticates and launches the provider.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {integrationFields.map((field) => (
                <FormField key={field.key} label={field.label} htmlFor={`registration-${field.key}`} error={fieldErrors[field.key]}>
                  <input
                    id={`registration-${field.key}`}
                    required
                    readOnly={field.key === "signatureAlgorithm"}
                    value={String(form[field.key])}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className={inputClassName(Boolean(fieldErrors[field.key]))}
                  />
                </FormField>
              ))}
            </div>

            <div className="border-t border-[var(--line)] pt-5">
              <h3 className="font-semibold text-[var(--navy)]">Transaction identity</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">The provider must expose stable identifiers so wallet events can be traced and made idempotent.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {transactionFields.map((field) => (
                <FormField key={field.key} label={field.label} htmlFor={`registration-${field.key}`} error={fieldErrors[field.key]}>
                  <input
                    id={`registration-${field.key}`}
                    required
                    value={String(form[field.key])}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className={inputClassName(Boolean(fieldErrors[field.key]))}
                  />
                </FormField>
              ))}
            </div>

            {formError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-[var(--coral)]">{formError}</p> : null}
            {notice ? <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
            <div className="flex justify-end">
              {editingAppKey ? <button type="button" onClick={cancelEdit} disabled={isSubmitting} className="mr-3 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--navy)] hover:bg-[var(--mint)] disabled:opacity-60">Cancel</button> : null}
              <button type="submit" disabled={isSubmitting} className="rounded-xl bg-[var(--navy)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? (editingAppKey ? "Saving..." : "Registering...") : (editingAppKey ? "Save changes" : "Register app")}
              </button>
            </div>
          </form>
        </Card>

        <section className="flex flex-col gap-3" aria-labelledby="registered-apps-heading">
          <div>
            <h3 id="registered-apps-heading" className="text-lg font-bold text-[var(--navy)]">Registered apps</h3>
            <p className="text-sm text-[var(--muted)]">Each app key can be registered only once.</p>
          </div>
          {registrations.status === "loading" ? <Card><p className="text-sm text-[var(--muted)]">Loading registrations...</p></Card> : null}
          {registrations.status === "error" ? <Card><p role="alert" className="text-sm text-[var(--coral)]">{registrations.error}</p></Card> : null}
          {registrations.status === "ready" && registrations.items.length === 0 ? <Card><p className="text-sm text-[var(--muted)]">No external apps have been registered.</p></Card> : null}
          {registrations.items.map((registration) => (
            <Card key={registration.id} className="flex flex-col gap-3">
              <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
                <div>
                  <p className="font-semibold text-[var(--navy)]">{registration.appName}</p>
                  <p className="text-sm text-[var(--muted)]">{registration.providerName} · Generated App Key</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${registration.active && registration.status === GameStatus.Active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{registration.active && registration.status === GameStatus.Active ? "Active" : "Inactive"}</span>
                  <button type="button" onClick={() => revealCredentials(registration.appKey)} disabled={revealingAppKey === registration.appKey} className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--navy)] hover:bg-[var(--mint)] disabled:opacity-60">
                    {revealingAppKey === registration.appKey ? "Loading..." : "View credentials"}
                  </button>
                  <button type="button" onClick={() => editRegistration(registration)} className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--navy)] hover:bg-[var(--mint)]">Edit</button>
                  <button type="button" onClick={() => deleteRegistration(registration)} disabled={deletingAppKey === registration.appKey} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                    {deletingAppKey === registration.appKey ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
              <p className="text-sm text-[var(--muted)]">Transactions: {registration.transactionIdField}, {registration.transactionTypeField}, {registration.gameTypeField}, {registration.requestIdField}</p>
              <p className="text-xs text-[var(--muted)]">API: {registration.apiBaseUrl} · Provider signing secret reference: {registration.credentialReference}</p>
            </Card>
          ))}
        </section>

        {credentials ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy)]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="credentials-title">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold)]">Save these credentials</p>
                <h3 id="credentials-title" className="mt-1 text-xl font-bold text-[var(--navy)]">Generated app access</h3>
              </div>
              <button type="button" aria-label="Close credentials" onClick={() => setCredentials(null)} className="text-xl text-[var(--muted)]">×</button>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">The secret is shown only through this controlled reveal flow. Configure both values in the registered app before making signed requests.</p>
            <div className="mt-4 flex flex-col gap-3">
              <code className="break-all rounded-xl bg-slate-100 p-3 text-xs text-[var(--ink)]">App Key: {credentials.appKey}</code>
              <code className="break-all rounded-xl bg-slate-100 p-3 text-xs text-[var(--ink)]">Secret: {credentials.signingSecret}</code>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setCredentials(null)} className="rounded-xl bg-[var(--navy)] px-4 py-2.5 text-sm font-semibold text-white">Done</button>
            </div>
          </div>
        </div> : null}

        {typeof document !== "undefined" && showInstructions ? createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy)]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="instructions-title">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold)]">Provider onboarding</p>
                <h3 id="instructions-title" className="mt-1 text-xl font-bold text-[var(--navy)]">How to register an app</h3>
              </div>
              <button type="button" aria-label="Close instructions" onClick={() => setShowInstructions(false)} className="text-xl text-[var(--muted)]">×</button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--ink)]">
              <li>Enter the app identity, launch URL, and provider API URL.</li>
              <li>Declare the authentication and chip transaction field names used by the app.</li>
              <li>Submit the form. Barangay Game Center generates a SHA-256 App Key and Secret.</li>
              <li>Copy both generated values into the app’s server environment and keep the Secret private.</li>
              <li>Sign every request with HMAC-SHA256 using the concatenated payload field values, excluding <code>sign</code>.</li>
            </ol>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setShowInstructions(false)} className="rounded-xl bg-[var(--navy)] px-4 py-2.5 text-sm font-semibold text-white">Close</button>
            </div>
          </div>
        </div>, document.body) : null}
      </section>
    </RequireRole>
  );
}
