'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LanguageSwitcher } from '@/components/language-switcher';

// Bidirectional verification page for the early-phase shadcn shortlist
// (WS-16, ACTION-PLAN DoD 1.4). Every component below must render correctly
// in BOTH ar (RTL) and en (LTR).
export default function RtlCheckPage() {
  const t = useTranslations('rtlCheck');

  return (
    <main className="mx-auto max-w-2xl space-y-6 ps-6 pe-6 pt-10 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">{t('title')}</h1>
        <LanguageSwitcher />
      </div>
      <p className="text-muted-foreground text-sm">{t('subtitle')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button>{t('buttonPrimary')}</Button>
        <Button variant="outline">{t('buttonOutline')}</Button>
        <Badge>{t('badge')}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>{t('cardBody')}</CardContent>
      </Card>

      <div className="grid gap-2">
        <Label htmlFor="emp-name">{t('inputLabel')}</Label>
        <Input id="emp-name" placeholder={t('inputPlaceholder')} />
      </div>

      <div className="grid gap-2">
        <Label>{t('selectLabel')}</Label>
        <Select>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t('selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="saudi">{t('selectOption1')}</SelectItem>
            <SelectItem value="resident">{t('selectOption2')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog>
        <DialogTrigger render={<Button variant="secondary" />}>
          {t('dialogTrigger')}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
            <DialogDescription>{t('dialogBody')}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableName')}</TableHead>
            <TableHead>{t('tableRole')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{t('tableRow1Name')}</TableCell>
            <TableCell>{t('tableRow1Role')}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{t('tableRow2Name')}</TableCell>
            <TableCell>{t('tableRow2Role')}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </main>
  );
}
