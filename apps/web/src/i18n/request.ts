import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { rtlSafeMessages } from '@hr/text';
import { routing } from './routing';

// UX-20: the layout is left to right in both languages (ADR-012), and an Arabic
// message only reads in order there if its numbers, names and final punctuation
// are tied into it. `rtlSafeMessages` does that to every Arabic message, here —
// the ONE place messages are loaded — so `messages/ar.json` stays plain text.
// Done once per loaded file, not once per request.
const safe = new WeakMap<object, object>();
function arabic(messages: object): object {
  let made = safe.get(messages);
  if (!made) safe.set(messages, (made = rtlSafeMessages(messages)));
  return made;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    messages: locale === 'ar' ? arabic(messages) : messages,
  };
});
