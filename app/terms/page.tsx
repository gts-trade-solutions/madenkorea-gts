import { CustomerLayout } from '@/components/CustomerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsPage() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-8 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms & Conditions</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Introduction</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                Welcome to MadenKorea. These terms and conditions outline the rules and regulations
                for the use of our website and services. By accessing this website, we assume you
                accept these terms and conditions. Do not continue to use MadenKorea if you do not
                agree to all of the terms and conditions stated on this page.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Definitions</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Website</strong> refers to MadenKorea, accessible from madenkorea.com</li>
                <li><strong>You</strong> means the individual accessing or using the Service</li>
                <li><strong>Company</strong> refers to MadenKorea</li>
                <li><strong>Service</strong> refers to the Website and all related services</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Use License</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                Permission is granted to temporarily access the materials on MadenKorea's website
                for personal, non-commercial transitory viewing only. This is the grant of a license,
                not a transfer of title, and under this license you may not:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose or public display</li>
                <li>Attempt to decompile or reverse engineer any software on the website</li>
                <li>Remove any copyright or proprietary notations from the materials</li>
                <li>Transfer the materials to another person or mirror the materials on any other server</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Product Information</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                We strive to display our products as accurately as possible. However, we do not
                guarantee that product descriptions, colors, or other content on the website is
                accurate, complete, reliable, current, or error-free. Product availability and
                pricing are subject to change without notice.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. Orders and Payments</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                By placing an order, you represent that you are legally capable of entering into
                binding contracts. We reserve the right to refuse any order placed through the
                website. All payments must be received before we dispatch your order.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>6. Shipping and Delivery</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                We aim to dispatch orders within 2-3 business days. Delivery times may vary based
                on your location. Risk of loss and title for items purchased pass to you upon
                delivery to the carrier. We are not responsible for delays caused by the shipping
                carrier or customs.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>7. Returns and Refunds</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                We accept returns within 7 days of delivery for unopened and unused products in
                their original packaging. Refunds will be processed within 7-10 business days after
                we receive the returned item. Shipping costs are non-refundable.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>8. User Account</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                You are responsible for maintaining the confidentiality of your account and password.
                You agree to accept responsibility for all activities that occur under your account.
                We reserve the right to refuse service, terminate accounts, or remove content at our
                sole discretion.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>9. Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                In no event shall MadenKorea or its suppliers be liable for any damages arising out
                of the use or inability to use the materials on the website, even if authorized
                representatives have been notified of the possibility of such damage.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>10. Governing Law</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                These terms and conditions are governed by and construed in accordance with the laws
                of India, and you irrevocably submit to the exclusive jurisdiction of the courts in
                that location.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>11. Changes to Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                We reserve the right to revise these terms at any time. By using this website, you
                are expected to review these terms regularly to ensure you understand all terms and
                conditions governing the use of this website.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>12. Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                If you have any questions about these Terms & Conditions, please contact us at:
              </p>
              <ul className="list-none space-y-2 mt-4">
                <li><strong>Email:</strong> support@madenkorea.com</li>
                <li><strong>Phone:</strong> +91 1234567890</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Last updated: October 9, 2025</p>
        </div>
      </div>
    </CustomerLayout>
  );
}
