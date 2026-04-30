import { CustomerLayout } from "@/components/CustomerLayout";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | MadenKorea',
  description:
    'Read how MadenKorea collects, uses, shares, and protects your personal data. Last updated April 20, 2026.',
  alternates: {
    canonical: 'https://madenkorea.com/privacy', // adjust if your route differs
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'article',
    url: 'https://madenkorea.com/privacy',
    siteName: 'MadenKorea',
    title: 'Privacy Policy',
    description:
      'Our commitment to your privacy—data we collect, how we use it, and your rights.',
    publishedTime: '2026-04-20',
    modifiedTime: '2026-04-20',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | MadenKorea',
    description:
      'Our commitment to your privacy—data we collect, how we use it, and your rights.',
  },
  other: {
    'format-detection': 'telephone=no, address=no, email=no',
  },
};

export default function PrivacyPage() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-6">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">
            Last updated: April 20, 2026
          </p>

          <div className="prose prose-lg max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Introduction</h2>
              <p className="text-muted-foreground mb-4">
                Welcome to MadenKorea. We respect your privacy and are committed
                to protecting your personal data. This privacy policy will
                inform you about how we look after your personal data when you
                visit our website and tell you about your privacy rights.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                Information We Collect
              </h2>
              <p className="text-muted-foreground mb-4">
                We may collect, use, store and transfer different kinds of
                personal data about you:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
                <li>
                  <strong>Identity Data:</strong> Name, username, date of birth
                </li>
                <li>
                  <strong>Contact Data:</strong> Email address, phone number,
                  billing and delivery addresses
                </li>
                <li>
                  <strong>Financial Data:</strong> Payment card details
                  (processed securely through payment providers)
                </li>
                <li>
                  <strong>Transaction Data:</strong> Details about payments and
                  products purchased
                </li>
                <li>
                  <strong>Technical Data:</strong> IP address, browser type,
                  device information
                </li>
                <li>
                  <strong>Usage Data:</strong> Information about how you use our
                  website and services
                </li>
                <li>
                  <strong>Marketing Data:</strong> Your preferences in receiving
                  marketing communications
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                How We Use Your Information
              </h2>
              <p className="text-muted-foreground mb-4">
                We use your personal data for the following purposes:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
                <li>To process and deliver your orders</li>
                <li>To manage your account and provide customer support</li>
                <li>
                  To send you important information about your orders and
                  account
                </li>
                <li>To improve our website, products, and services</li>
                <li>
                  To send you marketing communications (with your consent)
                </li>
                <li>To protect against fraud and ensure website security</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Data Security</h2>
              <p className="text-muted-foreground mb-4">
                We have implemented appropriate security measures to prevent
                your personal data from being accidentally lost, used, or
                accessed in an unauthorized way. We limit access to your
                personal data to those employees, agents, contractors, and other
                third parties who have a business need to know.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                Sharing Your Information
              </h2>
              <p className="text-muted-foreground mb-4">
                We may share your personal data with:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
                <li>
                  Service providers who help us operate our business (payment
                  processors, delivery companies)
                </li>
                <li>
                  Vendors whose products you purchase through our marketplace
                </li>
                <li>Professional advisers including lawyers and auditors</li>
                <li>Government authorities when required by law</li>
              </ul>
              <p className="text-muted-foreground mb-4">
                We require all third parties to respect the security of your
                personal data and to treat it in accordance with the law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Your Rights</h2>
              <p className="text-muted-foreground mb-4">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
                <li>Access your personal data</li>
                <li>Correct inaccurate personal data</li>
                <li>Request deletion of your personal data</li>
                <li>Object to processing of your personal data</li>
                <li>Request restriction of processing your personal data</li>
                <li>Request transfer of your personal data</li>
                <li>Withdraw consent at any time</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Cookies</h2>
              <p className="text-muted-foreground mb-4">
                Our website uses cookies to distinguish you from other users and
                to provide you with a better experience. Cookies are small text
                files that are placed on your device to collect standard
                internet log information and visitor behavior information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Data Retention</h2>
              <p className="text-muted-foreground mb-4">
                We will only retain your personal data for as long as necessary
                to fulfill the purposes we collected it for, including for the
                purposes of satisfying any legal, accounting, or reporting
                requirements.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                Changes to This Policy
              </h2>
              <p className="text-muted-foreground mb-4">
                We may update this privacy policy from time to time. We will
                notify you of any changes by posting the new privacy policy on
                this page and updating the last updated date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
              <p className="text-muted-foreground mb-4">
                If you have any questions about this privacy policy or our
                privacy practices, please contact us at:
              </p>
              <ul className="list-none space-y-2 text-muted-foreground mb-4">
                <li>
                  <strong>Email:</strong> info@madenkorea.com
                </li>
                {/* <li>
                  <strong>Phone:</strong> +91 1800 123 4567
                </li>
                <li>
                  <strong>Address:</strong> 123 Consumer Innovations Street,
                  Mumbai, Maharashtra 400001, India
                </li> */}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
