import type { EmailMessage } from '../../notifications/public-api';

// Account emails (SS-06a): the invitation and the password reset, in Arabic or
// English. Plain text, like the notification emails (NOTIF-03).
//
// The link carries the token in the URL FRAGMENT (`#token=…`), not the query
// string: a fragment is never sent to a server, so the token stays out of web
// server and proxy logs and out of the Referer header. The SS-06b page reads it
// from `location.hash`.

type Lang = 'ar' | 'en';

function origin(): string {
  return (process.env.APP_WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export function setPasswordLink(lang: Lang, token: string): string {
  return `${origin()}/${lang}/account/set-password#token=${token}`;
}

export function inviteEmail(
  to: string,
  lang: Lang,
  token: string,
  companyName: string,
): EmailMessage {
  const link = setPasswordLink(lang, token);
  return lang === 'ar'
    ? {
        to,
        subject: 'دعوة إلى ملفك في PEOPLE&GRO',
        text: [
          `دعتك ${companyName} إلى الاطلاع على ملفك الوظيفي في PEOPLE&GRO: مستنداتك وتواريخ انتهائها وطلباتك.`,
          '',
          'لتفعيل حسابك، اختر كلمة مرور من هذا الرابط (صالح لمدة 7 أيام):',
          link,
          '',
          'إذا لم تكن تتوقع هذه الرسالة، يمكنك تجاهلها.',
        ].join('\n'),
      }
    : {
        to,
        subject: 'Your PEOPLE&GRO file — invitation',
        text: [
          `${companyName} has invited you to see your employee file in PEOPLE&GRO: your documents, their expiry dates, and your requests.`,
          '',
          'To activate your account, choose a password using this link (valid for 7 days):',
          link,
          '',
          'If you were not expecting this, you can ignore it.',
        ].join('\n'),
      };
}

export function resetEmail(to: string, lang: Lang, token: string): EmailMessage {
  const link = setPasswordLink(lang, token);
  return lang === 'ar'
    ? {
        to,
        subject: 'إعادة تعيين كلمة المرور — PEOPLE&GRO',
        text: [
          'طُلبت إعادة تعيين كلمة المرور لحسابك.',
          '',
          'لاختيار كلمة مرور جديدة استخدم هذا الرابط (صالح لمدة ساعة واحدة):',
          link,
          '',
          'إذا لم تطلب ذلك، تجاهل هذه الرسالة؛ كلمة مرورك الحالية لم تتغير.',
        ].join('\n'),
      }
    : {
        to,
        subject: 'Reset your PEOPLE&GRO password',
        text: [
          'Someone asked to reset the password for your account.',
          '',
          'To choose a new password, use this link (valid for 1 hour):',
          link,
          '',
          'If this wasn’t you, ignore this email — your current password has not changed.',
        ].join('\n'),
      };
}
