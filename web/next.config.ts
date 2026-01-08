/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const isSoftLaunch = process.env.SOFT_LAUNCH_ENABLED === "true";
    const isDev = process.env.NODE_ENV !== "production";

    const scriptSrc = [
      "'self'",

      // Midtrans (sandbox + prod)
      "https://app.sandbox.midtrans.com",
      "https://api.sandbox.midtrans.com",
      "https://app.midtrans.com",
      "https://api.midtrans.com",

      // Your existing allowed sources
      "https://snap-assets.al-pc-id-b.cdn.gtflabs.io",
      "https://pay.google.com",
      "https://gwk.gopayapi.com/sdk/stable/gp-container.min.js",

      // Observability (optional)
      "https://js-agent.newrelic.com",
      "https://bam.nr-data.net",

      // Google Maps / Places
      "https://maps.googleapis.com",
      "https://maps.gstatic.com",
    ];

    // ✅ Unblock inline scripts ONLY for dev/soft-launch
    if (isSoftLaunch || isDev) {
      scriptSrc.push("'unsafe-inline'");
      scriptSrc.push("'unsafe-eval'");
    }

    const csp = [
      `default-src 'self'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      `frame-ancestors 'none'`,
      `img-src 'self' data: blob: https:`,
      `font-src 'self' data: https:`,
      `style-src 'self' 'unsafe-inline' https:`,
      `connect-src 'self' https:`,
      `frame-src 'self' https:`,
      `script-src ${scriptSrc.join(" ")}`,
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
