import { LegalPage, type LegalSection } from '@/components/layout/LegalPage';
import { communityContact } from '@/constants/landing';

const sections: LegalSection[] = [
  {
    heading: 'Using the App',
    body: [
      'By using Davaine you agree to these terms. Accounts are created by management and are for your personal use only.',
    ],
  },
  {
    heading: 'Your Account',
    body: ['Keep your password private. You are responsible for activity under your account.'],
  },
  {
    heading: 'Rent and Bills',
    body: [
      'Monthly rent, electricity, and water charges are computed as shown in the app. Pay on or before the due date shown on your bill.',
    ],
  },
  {
    heading: 'Feedback',
    body: [
      'Ratings and comments are posted anonymously. Management may hide content that is abusive, false, or off-topic.',
    ],
  },
  {
    heading: 'Room Listings',
    body: ['Rates, photos, and availability may change without notice. A room is reserved only after management confirms it.'],
  },
  {
    heading: 'Changes',
    body: ['We may update these terms. Continued use of the app means you accept the updated terms.'],
  },
  {
    heading: 'Contact',
    body: [`${communityContact.email} · ${communityContact.telephone}`],
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms and Conditions" updated="October 3, 2026" sections={sections} />;
}
