'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { RequestType, SelfRequestResponse } from '@hr/contracts';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const TYPES: RequestType[] = ['letter', 'certificate', 'document', 'gro_service', 'general'];

// Raise a request (SS-07) over POST /me/requests. The employee chooses what the
// request is ABOUT — type, title, an optional description — and nothing else:
// company, status, priority and assignee are fixed by the server and by the
// database (SS-05), so the form does not pretend to offer them. Used from both
// "My file" and "My requests".
export function RaiseRequestDialog({
  open,
  onOpenChange,
  onRaised,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRaised: (request: SelfRequestResponse) => void;
}) {
  const t = useTranslations('me');
  const tReq = useTranslations('requests');
  const [type, setType] = useState<RequestType>('letter');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Start each opening blank. Resetting on success instead cleared the form
  // while it was still fading out — the person watched their request empty
  // itself (seen in verification, SS-07).
  useEffect(() => {
    if (!open) return;
    setType('letter');
    setTitle('');
    setDescription('');
    setError('');
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t('titleRequired'));
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<SelfRequestResponse>('/me/requests', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      onRaised(created);
      onOpenChange(false);
    } catch {
      setError(t('raiseFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('raiseTitle')}</DialogTitle>
            <DialogDescription>{t('raiseDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-type">{t('fieldType')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
              <SelectTrigger id="request-type" className="w-full">
                <SelectValue>{(v) => tReq(`type.${String(v)}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {tReq(`type.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-title">{t('fieldTitle')}</Label>
            <Input
              id="request-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              aria-invalid={error === t('titleRequired') ? true : undefined}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-description">{t('fieldDescription')}</Label>
            <Textarea
              id="request-description"
              value={description}
              maxLength={4000}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? t('raising') : t('raise')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
