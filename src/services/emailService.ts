import { auth } from '../firebase';
import { getManagerSessionToken } from './managerAuthService';

export type EmailEventType = 'NEW_REQUEST' | 'RECEIVED' | 'APPROVED' | 'REJECTED';

export interface EmailDispatchResult {
  sent: boolean;
  mode: 'resend' | 'in_app_and_mailto' | 'skipped';
  recipient?: string;
}

export async function dispatchEmailNotification(params: {
  to: string;
  subject: string;
  message: string;
  eventType: EmailEventType;
}): Promise<EmailDispatchResult> {
  try {
    const managerToken = getManagerSessionToken();
    const firebaseToken = await auth.currentUser?.getIdToken().catch(() => undefined);
    const token = managerToken || firebaseToken;
    if (!token && params.eventType !== 'NEW_REQUEST') {
      return { sent: false, mode: 'skipped' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch('/api/notify-email', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      return { sent: false, mode: 'in_app_and_mailto', recipient: params.to };
    }

    const data = (await res.json()) as EmailDispatchResult;
    return data;
  } catch {
    return { sent: false, mode: 'in_app_and_mailto', recipient: params.to };
  }
}

export function buildMailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
