'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// "Ask for more detail" (THREAD-03, ADR-016 rev. 2). The note is required — it is
// the question, posted to the thread as the asker's comment — and the request
// waits on the requester until their side replies (a comment, or a file that
// passes its checks), then returns to where it was.
export function AskInfoDialog({
  open,
  onOpenChange,
  busy,
  error,
  onAsk,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string;
  onAsk: (note: string) => void;
}) {
  const t = useTranslations('requests');
  const [note, setNote] = useState('');
  // Reset on every opening — tracked during render, because Base UI's
  // onOpenChange never fires when the parent sets `open` (DS-09 landmine).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNote('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (note.trim()) onAsk(note.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('askTitle')}</DialogTitle>
            <DialogDescription>{t('askLead')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ask-info-note">{t('askNote')}</Label>
            <Textarea
              id="ask-info-note"
              rows={4}
              maxLength={4000}
              value={note}
              placeholder={t('askPlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('askCancel')}
            </Button>
            <Button type="submit" disabled={busy || !note.trim()}>
              {busy ? t('asking') : t('askSend')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
