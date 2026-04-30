// app/admin/marketing/facebook/page.jsx
"use client";

import FacebookDashboard from "./components/FacebookDashboard";

export default function FacebookPage() {
  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Facebook & Instagram Marketing
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your Facebook ad account, campaigns and Instagram link from a single admin panel.
            </p>
          </div>
        </header>

        <FacebookDashboard />
      </div>
    </div>
  );
}
