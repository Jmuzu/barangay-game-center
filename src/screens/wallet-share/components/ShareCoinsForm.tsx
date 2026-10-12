"use client";

import { FormEvent, useState } from "react";
import { Button, FormField } from "@shared/components";
import { validateShareAmount } from "@shared/helpers";

interface ShareCoinsFormProps {
  balance: number;
  dailyRemaining: number;
  recipients: Array<{ id: string; displayName: string }>;
  disabled?: boolean;
  onShare: (input: { recipientId: string; amount: number; note?: string }) => Promise<void>;
}

export function ShareCoinsForm({ balance, dailyRemaining, recipients, disabled = false, onShare }: ShareCoinsFormProps) {
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    const validationError = validateShareAmount({
      amount: parsedAmount,
      balance,
      dailyRemaining,
      recipientName: recipients.find((recipient) => recipient.id === recipientId)?.displayName ?? "",
      selfName: "",
    });

    if (validationError) {
      setError(validationError);
      setSuccess(false);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onShare({ recipientId, amount: parsedAmount, note: note.trim() || undefined });
      setSuccess(true);
      setRecipientId("");
      setAmount("");
      setNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete the transfer.");
      setSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <FormField label="Recipient" htmlFor="recipientId">
        <select
          id="recipientId"
          value={recipientId}
          required
          disabled={disabled || isSubmitting}
          onChange={(event) => {
            setSuccess(false);
            setRecipientId(event.target.value);
          }}
          className="platform-field"
        >
          <option value="">Select a player</option>
          {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.displayName}</option>)}
        </select>
      </FormField>

      <FormField label="Amount" htmlFor="amount">
        <input
          id="amount"
          type="number"
          min={1}
          step={1}
          value={amount}
          required
          disabled={disabled || isSubmitting}
          onChange={(event) => {
            setSuccess(false);
            setAmount(event.target.value);
          }}
          className="platform-field"
        />
      </FormField>

      <FormField label="Note (optional)" htmlFor="note">
        <input
          id="note"
          value={note}
          maxLength={140}
          disabled={disabled || isSubmitting}
          onChange={(event) => setNote(event.target.value)}
          className="platform-field"
        />
      </FormField>

      {error ? (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? "Sending..." : "Share coins"}
      </Button>

      {success ? (
        <p role="status" className="text-sm text-emerald-400">
          Coins shared successfully.
        </p>
      ) : null}
    </form>
  );
}
