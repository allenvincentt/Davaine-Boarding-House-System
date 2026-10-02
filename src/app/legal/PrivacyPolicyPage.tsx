import { LegalPage, type LegalSection } from '@/components/layout/LegalPage';
import { communityContact } from '@/constants/landing';

const sections: LegalSection[] = [
  {
    heading: 'Information We Collect',
    body: [
      'Account details: name, email address, phone number, and user role.',
      'Tenancy details: room assignment, move-in date, meter readings, bills, and payments.',
      'Anonymous room ratings and comments you choose to submit.',
    ],
  },
  {
    heading: 'How We Use It',
    body: [
      'To manage rooms, compute and issue bills, record payments, and contact you about your stay. We do not sell your data.',
    ],
  },
  {
    heading: 'Sign-In and Device Data',
    body: [
      'Passwords are stored only as a one-way hash. Fingerprint sign-in is checked by your device; we never receive your fingerprint. Push notification tokens are used only to send you app alerts.',
    ],
  },
  {
    heading: 'Sharing',
    body: [
      'Your data is visible only to Davaine management and the service providers that host the app. We share it with others only when required by law.',
    ],
  },
  {
    heading: 'Retention',
    body: ['We keep tenancy and billing records while you stay with us and as long as the law requires after you leave.'],
  },
  {
    heading: 'Your Rights',
    body: [
      'Under the Data Privacy Act of 2012 (RA 10173), you may access, correct, or ask us to delete your personal data.',
    ],
  },
  {
    heading: 'Contact',
    body: [`${communityContact.email} · ${communityContact.telephone}`],
  },
];

export default function PrivacyPolicyPage() {
  return <LegalPage title="Privacy Policy" updated="October 3, 2026" sections={sections} />;
}
